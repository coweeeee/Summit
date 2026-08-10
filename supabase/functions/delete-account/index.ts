import { createClient } from "npm:@supabase/supabase-js@2";

// Deletes the requesting user's account entirely. This is what satisfies App
// Store guideline 5.1.1(v), so it must keep working:
//  1. Verifies the caller's JWT (so users can only delete themselves).
//  2. Best-effort removes their files from the avatars/ and hike-photos/
//     storage buckets. storage.objects has exactly one FK, to storage.buckets,
//     and none to auth.users - so nothing cascades and the files would
//     otherwise be orphaned. This step is the only thing here that a plain
//     `DELETE FROM auth.users` cannot replicate.
//  3. Calls auth.admin.deleteUser(), which cascades through the FK chain.
//
// What actually cascades, verified against pg_constraint rather than memory:
//  - directly off auth.users: profiles, comments, hike_photos, push_tokens,
//    want_to_hike
//  - off profiles:            hikes, likes, follows, blocks, trail_requests,
//                             user_badges
//  - off hikes:               comments, dim_ratings, hike_photos, likes
//
// `reports` is the deliberate exception and does NOT cascade. All four of its
// FKs are ON DELETE SET NULL, so an abuse report survives the reported user
// deleting their account - that is the entire point of moderation-integrity.sql,
// which names this function as one of the destruction paths it was written to
// close. Do not "fix" reports to cascade.
//
// (An earlier version of this comment claimed reports cascaded and listed a
// `saved_hikes` table that does not exist. Both were wrong.)
//
// Security model:
//  - Caller must have a valid session (verify_jwt: true on the deployment, and
//    a bearer token is required below regardless). This function must only
//    ever delete the caller's OWN account, never a user_id from the request
//    body - it does not read the body at all.
//
// The storage cleanup pages. An earlier version called .list() once, which
// storage-js caps at 100 objects, so a user with more than 100 photos kept the
// remainder - publicly readable, since both buckets are public - after deleting
// their account. See the loop below for why it re-reads page 0 rather than
// advancing an offset.
Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization header" }), { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Client scoped to the caller's own JWT, used only to identify who they are.
  const callerClient = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await callerClient.auth.getUser();

  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Invalid or expired session" }), { status: 401 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Best-effort storage cleanup - don't let a listing/removal hiccup block
  // the actual account deletion, which is the part that matters most.
  //
  // This pages. storage-js applies DEFAULT_SEARCH_OPTIONS = { limit: 100 } and
  // does not paginate on its own, so a single list() removed at most 100 objects
  // per bucket and silently left the rest. Both buckets are public, so anything
  // left behind stayed fetchable at its URL after the account was gone - the
  // opposite of what deleting an account is supposed to mean.
  //
  // Each pass re-reads the FIRST page rather than advancing an offset: the pass
  // deletes what it just read, so the next batch shifts down into offset 0.
  // Advancing the offset while deleting would step over every other page.
  const PAGE_SIZE = 100;
  // Bounded so a remove() that reports success without deleting cannot spin
  // forever and hold the request open. 100 pages is 10k objects per bucket.
  const MAX_PAGES = 100;
  for (const bucket of ["avatars", "hike-photos"]) {
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const { data: files, error: listError } = await admin.storage
          .from(bucket)
          .list(user.id, { limit: PAGE_SIZE });
        if (listError || !files || files.length === 0) break;

        const paths = files.map((f) => `${user.id}/${f.name}`);
        const { error: removeError } = await admin.storage.from(bucket).remove(paths);
        // Without this the loop would re-read the same undeleted page forever.
        if (removeError) break;
      }
    } catch (_e) {
      // Non-fatal - proceed to account deletion regardless.
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);

  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
