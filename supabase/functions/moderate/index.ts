import { createClient } from "npm:@supabase/supabase-js@2";

// Operator moderation: remove reported content, and ban or unban an account.
//
// WHY THIS IS AN EDGE FUNCTION AND NOT A SET OF SQL FUNCTIONS. Storage is not
// reachable from Postgres. `storage.protect_objects_delete` is a BEFORE DELETE
// trigger raising 42501 "Direct deletion from storage tables is not allowed",
// and it blocks a SECURITY DEFINER function exactly as hard as it blocks a
// human -- setting the escape-hatch GUC only orphans the underlying bytes. So a
// SQL-editor runbook cannot delete a reported photo, only its row. Only the
// Storage API with the service role can, which means this has to run here.
//
// Deleting content is safe for evidence. reports_capture_snapshot copies the
// offending text and the reported username into snapshot columns that carry no
// foreign keys, and all four live FKs are ON DELETE SET NULL, so a report row
// survives the deletion of everything it names. A hide/soft-delete flag would
// buy reversibility, not evidence, and is deliberately not built.
//
// KNOWN GAP, not fixed here: a photo cannot be *reported* as a photo --
// reports_target_kind_check is ('user','hike','comment') and the snapshot
// captures no storage path. Photos can be removed (see delete_photo) but must
// be reported via their hike. Extending that needs its own migration.
//
// Security model:
//  - Deploy with verify_jwt = false. Any signed-in user's JWT would satisfy
//    verify_jwt, so it is worth nothing here; authorization is an exact match
//    against MODERATE_SECRET instead. Same reasoning as report-alert.
//  - This function can delete any content and ban any account. The secret is
//    the only gate. Rotate it the way report-alert's is rotated, and never put
//    it in a client.
//  - Every action is echoed to the moderation chat channel, which is the
//    closest thing to an audit trail that costs no migration. It is a chat
//    message, not a database record -- if a real audit trail is wanted later,
//    that is a table and a migration.
//
// Env: MODERATE_SECRET (required), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//      REPORT_ALERT_WEBHOOK_URL (optional -- actions still run without it).

type Action =
  | "delete_hike"
  | "delete_comment"
  | "delete_photo"
  | "clear_avatar"
  | "ban_user"
  | "unban_user";

const ACTIONS: Action[] = [
  "delete_hike",
  "delete_comment",
  "delete_photo",
  "clear_avatar",
  "ban_user",
  "unban_user",
];

/** Mirrors report-alert: a trail named @everyone must not ping the channel. */
function sanitizeForChat(text: string): string {
  return text.replace(/@(everyone|here)/gi, "@​$1").slice(0, 500);
}

async function notify(lines: string[]): Promise<void> {
  const url = Deno.env.get("REPORT_ALERT_WEBHOOK_URL");
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: lines.join("\n") }),
    });
  } catch (_e) {
    // Never let the audit echo fail the removal. A takedown that half-happened
    // because a webhook timed out is worse than one nobody was told about.
  }
}

/**
 * Removes storage objects by explicit path, in batches.
 *
 * Paths rather than a folder listing, because a hike's photos live in the same
 * `${userId}/` folder as every other hike's -- listing would take them all.
 */
async function removePaths(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  paths: string[],
): Promise<number> {
  if (paths.length === 0) return 0;
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const { error } = await admin.storage.from(bucket).remove(batch);
    if (error) break;
    removed += batch.length;
  }
  return removed;
}

/**
 * Empties a user's folder in a bucket, paging.
 *
 * Used for avatars, where the filename carries the source extension -- someone
 * who uploaded a .jpg and later a .png leaves two objects and only the newer
 * one is discoverable from profiles.avatar_url. Deriving a single path from
 * that column is exactly how the stale one gets left behind.
 *
 * Re-reads page 0 each pass rather than advancing an offset: each pass deletes
 * what it just read, so the next batch shifts down into offset 0.
 */
async function emptyUserFolder(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  userId: string,
): Promise<number> {
  let removed = 0;
  for (let page = 0; page < 100; page++) {
    const { data: files, error } = await admin.storage.from(bucket).list(userId, { limit: 100 });
    if (error || !files || files.length === 0) break;
    const paths = files.map((f) => `${userId}/${f.name}`);
    const { error: removeError } = await admin.storage.from(bucket).remove(paths);
    if (removeError) break;
    removed += paths.length;
  }
  return removed;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("MODERATE_SECRET");
  if (!secret) {
    // Fail closed. Without the env var every request would otherwise be
    // compared against undefined and this becomes an open takedown endpoint.
    return json({ error: "Server is not configured for moderation" }, 500);
  }

  const provided = req.headers.get("Authorization");
  if (provided !== `Bearer ${secret}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: { action?: string; id?: string; reason?: string; duration?: string };
  try {
    body = await req.json();
  } catch (_e) {
    return json({ error: "Body must be JSON" }, 400);
  }

  const action = body.action as Action | undefined;
  const id = body.id?.trim();
  const reason = body.reason?.trim() || "(no reason given)";

  if (!action || !ACTIONS.includes(action)) {
    return json({ error: `action must be one of: ${ACTIONS.join(", ")}` }, 400);
  }
  if (!id) return json({ error: "id is required" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const detail: string[] = [];

  try {
    switch (action) {
      case "delete_hike": {
        // Read the photo paths BEFORE deleting the hike. hike_photos cascades
        // off hikes, so afterwards there is nothing left to tell us which
        // objects belonged to it -- and the objects do not cascade at all.
        const { data: photos } = await admin
          .from("hike_photos")
          .select("storage_path")
          .eq("hike_id", id);
        const paths = (photos ?? []).map((p: { storage_path: string }) => p.storage_path).filter(Boolean);

        const { error } = await admin.from("hikes").delete().eq("id", id);
        if (error) return json({ error: error.message }, 400);

        const removed = await removePaths(admin, "hike-photos", paths);
        detail.push(`hike ${id} deleted`, `${removed}/${paths.length} photo objects removed`);
        break;
      }

      case "delete_comment": {
        const { error } = await admin.from("comments").delete().eq("id", id);
        if (error) return json({ error: error.message }, 400);
        detail.push(`comment ${id} deleted`);
        break;
      }

      case "delete_photo": {
        const { data: photo } = await admin
          .from("hike_photos")
          .select("storage_path")
          .eq("id", id)
          .maybeSingle();
        if (!photo) return json({ error: "No such photo" }, 404);

        const { error } = await admin.from("hike_photos").delete().eq("id", id);
        if (error) return json({ error: error.message }, 400);

        const removed = await removePaths(admin, "hike-photos", [photo.storage_path]);
        detail.push(`photo ${id} deleted`, `${removed}/1 object removed`);
        break;
      }

      case "clear_avatar": {
        // Both halves. Nulling the column alone is the bug this exists to fix:
        // avatars is a public bucket, so the image stays readable at a stable
        // unauthenticated URL and share-preview keeps republishing it.
        const { error } = await admin
          .from("profiles")
          .update({ avatar_url: null, avatar_preset: null })
          .eq("id", id);
        if (error) return json({ error: error.message }, 400);

        const removed = await emptyUserFolder(admin, "avatars", id);
        detail.push(`avatar cleared for ${id}`, `${removed} object(s) removed`);
        break;
      }

      case "ban_user": {
        // Default 100 years, Supabase's own idiom for an indefinite ban.
        const duration = body.duration?.trim() || "876000h";
        const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: duration });
        if (error) return json({ error: error.message }, 400);
        detail.push(
          `user ${id} banned for ${duration}`,
          // Stated because it is genuinely surprising and affects what an
          // operator should expect to see immediately after acting.
          "note: an existing access token stays valid until it expires -- a ban blocks the next refresh, not the current session",
        );
        break;
      }

      case "unban_user": {
        const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: "none" });
        if (error) return json({ error: error.message }, 400);
        detail.push(`user ${id} unbanned`);
        break;
      }
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }

  await notify([
    `**Moderation action: ${action}**`,
    ...detail.map((d) => `- ${sanitizeForChat(d)}`),
    `- reason: ${sanitizeForChat(reason)}`,
  ]);

  return json({ ok: true, action, id, detail }, 200);
});
