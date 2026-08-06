import { createClient } from "npm:@supabase/supabase-js@2";

// Deletes the requesting user's account entirely:
//  1. Verifies the caller's JWT (so users can only delete themselves).
//  2. Best-effort removes their files from the avatars/ and hike-photos/
//     storage buckets (DB rows cascade automatically via FK constraints,
//     but storage objects don't, so they'd otherwise be orphaned).
//  3. Calls auth.admin.deleteUser(), which cascades through profiles ->
//     hikes/comments/likes/follows/saved_hikes/want_to_hike/blocks/reports/
//     push_tokens via the FK chain already set up on every one of those
//     tables (all ON DELETE CASCADE back to auth.users, directly or via
//     profiles).
//
// Deployed with verify_jwt implicitly enforced by requiring a valid bearer
// token below - this function must only ever delete the caller's own
// account, never an arbitrary user_id passed in the request body.
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
