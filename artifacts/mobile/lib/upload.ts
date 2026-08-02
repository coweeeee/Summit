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

export type UploadResult = { url: string; error: null } | { url: null; error: string };

export async function uploadImage(
  bucket: string,
  path: string,
  base64: string,
  ext: string
): Promise<UploadResult> {
  const bytes = base64ToBytes(base64);
  if (bytes.length === 0) return { url: null, error: "That image came back empty. Please pick another." };

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, bytes, { contentType: contentTypeForExt(ext), upsert: true });
  if (error) return { url: null, error: error.message };

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  // Cache-bust: the path is stable per user, so a replaced image would
  // otherwise keep rendering from the previously cached URL.
  return { url: `${data.publicUrl}?t=${Date.now()}`, error: null };
}
