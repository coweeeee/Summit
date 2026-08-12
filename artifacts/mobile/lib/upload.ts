import { supabase } from "@/lib/supabase";

// Image upload for React Native.
//
// Both the avatar and hike-photo screens previously did
// `fetch(uri) -> .blob() -> .arrayBuffer()`. React Native's Blob implements
// only `size`, `type` and `slice()` -- there is no `arrayBuffer()` -- so that
// threw a TypeError which each screen swallowed into a generic "could not pick
// image" alert. Neither bucket had ever received a single object as a result.
//
// The working path is to ask ImagePicker for base64 directly and decode it
// ourselves. Decoding is done with a lookup table rather than `atob` so this
// carries no assumption about which JS engine the app runs on.

const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const B64_LOOKUP = (() => {
  const table = new Uint8Array(256);
  for (let i = 0; i < B64_ALPHABET.length; i++) {
    table[B64_ALPHABET.charCodeAt(i)] = i;
  }
  return table;
})();

export function base64ToBytes(base64: string): Uint8Array {
  // Strips padding, whitespace and any data-URI prefix in one pass.
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, "");
  const bytes = new Uint8Array((clean.length * 3) >> 2);

  let out = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    buffer = (buffer << 6) | B64_LOOKUP[clean.charCodeAt(i)];
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[out++] = (buffer >> bits) & 0xff;
    }
  }
  return out === bytes.length ? bytes : bytes.subarray(0, out);
}

/** The old code built `image/${ext}`, which yields the invalid `image/jpg`. */
export function contentTypeForExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case "png": return "image/png";
    case "webp": return "image/webp";
    case "heic": return "image/heic";
    case "heif": return "image/heif";
    default: return "image/jpeg";
  }
}

/**
 * Both the storage path and a public URL, because the two buckets differ.
 *
 * `avatars` is public, so callers there persist `url` and render it directly.
 * `hike-photos` is private, so callers there persist `path` and mint a signed
 * URL at read time (see signedUrlsFor). `url` is meaningless for a private
 * bucket -- getPublicUrl builds the string happily but it 400s -- so the
 * private caller must never store it.
 *
 * Returning both rather than switching on the bucket keeps this helper honest
 * about what it did and leaves the choice with the caller that knows.
 */
export type UploadResult =
  | { path: string; url: string; error: null }
  | { path: null; url: null; error: string };

export async function uploadImage(
  bucket: string,
  path: string,
  base64: string,
  ext: string
): Promise<UploadResult> {
  const bytes = base64ToBytes(base64);
  if (bytes.length === 0) return { path: null, url: null, error: "That image came back empty. Please pick another." };

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, bytes, { contentType: contentTypeForExt(ext), upsert: true });
  if (error) return { path: null, url: null, error: error.message };

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  // Cache-bust: the path is stable per user, so a replaced image would
  // otherwise keep rendering from the previously cached URL.
  return { path, url: `${data.publicUrl}?t=${Date.now()}`, error: null };
}

/**
 * The one and only storage path for a user's avatar.
 *
 * Deliberately extensionless and fixed. It used to be `avatar.${ext}`, which
 * meant a .jpg later replaced by a .png left TWO objects with only the newer
 * one discoverable from profiles.avatar_url -- and since `avatars` is a public
 * bucket, the stale one stayed readable at an unauthenticated URL forever with
 * nothing pointing at it. One fixed path makes that unrepresentable rather than
 * something cleanup has to chase. The content type is carried by the upload's
 * contentType, not by the filename, so dropping the extension costs nothing.
 */
export function avatarPathFor(userId: string): string {
  return `${userId}/avatar`;
}

/**
 * Deletes the caller's own avatar object.
 *
 * Necessary because `avatars` is a PUBLIC bucket: clearing profiles.avatar_url
 * hides the picture in the app but leaves the file readable at a stable,
 * guessable, unauthenticated URL -- and share-preview keeps republishing it.
 * "Remove my profile picture" has to mean the file, not the row.
 *
 * Removes a known path rather than listing the folder first. Listing does not
 * work here: storage.objects has exactly one SELECT policy and it is scoped to
 * `bucket_id = 'hike-photos'`, so a list() on `avatars` under the user's own JWT
 * is RLS-filtered to empty and returns {data: [], error: null}. A list-then-
 * remove implementation reads that as "nothing to delete", returns cleanly, and
 * silently leaves the public file live -- while testing clean through the
 * service-role path, which bypasses RLS. remove() needs only the DELETE policy,
 * which does exist and is correctly owner-scoped.
 *
 * Best-effort: a storage failure must not block the profile update, or choosing
 * a preset icon starts failing for a reason the user cannot act on. The
 * `moderate` edge function sweeps the whole folder as a backstop.
 */
export async function clearAvatarObjects(userId: string): Promise<void> {
  try {
    await supabase.storage.from("avatars").remove([avatarPathFor(userId)]);
  } catch (_e) {
    // Deliberately swallowed -- see above.
  }
}

/** How long a minted hike-photo URL stays valid, in seconds. */
export const SIGNED_URL_TTL_SECONDS = 3600;

/**
 * Signs a batch of hike-photo paths in one request.
 *
 * Batched on purpose: a feed page is up to 20 hikes with several photos each,
 * and createSignedUrl (singular) would be one round trip per photo. Signing is
 * authorized as `objects.select` against the caller's own JWT, so the storage
 * SELECT policy -- not this function -- is what actually enforces who may see
 * whose photos. That is why signing stays on the client rather than moving to
 * an edge function with the service role, which would bypass the policy and
 * force the visibility rules to be reimplemented by hand.
 *
 * Returns a path -> URL map. Paths the viewer may not read come back as a
 * per-entry error rather than failing the batch, and are simply omitted: the
 * surrounding hike is legitimately visible even when one photo is not.
 */
export async function signedUrlsFor(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};

  const { data, error } = await supabase.storage
    .from("hike-photos")
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return {};

  const map: Record<string, string> = {};
  for (const entry of data) {
    if (entry.error || !entry.path || !entry.signedUrl) continue;
    map[entry.path] = entry.signedUrl;
  }
  return map;
}
