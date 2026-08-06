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
// Known limitation: the storage .list() below is unpaginated, so it removes at
// most the SDK default of 100 objects per bucket. Both buckets are empty today
// and the upload path was only fixed recently, so this has never bitten - but a
// user with more than 100 hike photos would leave files behind on deletion.
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
  for (const bucket of ["avatars", "hike-photos"]) {
    try {
      const { data: files } = await admin.storage.from(bucket).list(user.id);
      if (files && files.length > 0) {
        const paths = files.map((f) => `${user.id}/${f.name}`);
        await admin.storage.from(bucket).remove(paths);
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
