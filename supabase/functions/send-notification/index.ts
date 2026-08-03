import { createClient } from "npm:@supabase/supabase-js@2";

// Sends a push notification for one of three event types: 'like', 'follow',
// or 'milestone'. Called by the client right after the underlying action
// succeeds (a like/follow insert, or a hike log that crossed a badge
// threshold) - NOT by a database trigger, since edge functions have safe
// access to the service role key via their own runtime env, whereas doing
// this from a DB trigger would require embedding that secret in SQL.
//
// Security model:
//  - Caller must have a valid session (verify_jwt: true).
//  - For 'milestone', the caller may only report a badge for THEMSELVES
//    (targetUserId must equal the caller's own id) - prevents anyone from
//    awarding arbitrary badges to other users.
//  - For 'like'/'follow', the caller is reporting an action they just took
//    against someone else, so we verify a matching row actually exists
//    (a real like/follow from caller -> target) before sending anything -
//    prevents using this endpoint to spam arbitrary push notifications.
//  - The target's own notif_likes/notif_follows/notif_milestones preference
//    is checked before sending - if they've turned that category off, this
//    is a silent no-op.
Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization header" }), { status: 401 });
  }

  let body: {
    targetUserId?: string;
    type?: "like" | "follow" | "milestone";
    title?: string;
    body?: string;
    data?: Record<string, unknown>;
    badgeKey?: string;
    hikeId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const { targetUserId, type, title, body: message, data, badgeKey, hikeId } = body;
  if (!targetUserId || !type || !title || !message) {
    return new Response(JSON.stringify({ error: "targetUserId, type, title, and body are required" }), { status: 400 });
  }
  if (!["like", "follow", "milestone"].includes(type)) {
    return new Response(JSON.stringify({ error: "type must be 'like', 'follow', or 'milestone'" }), { status: 400 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const callerClient = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user: caller },
    error: callerError,
  } = await callerClient.auth.getUser();

  if (callerError || !caller) {
    return new Response(JSON.stringify({ error: "Invalid or expired session" }), { status: 401 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  if (type === "milestone") {
    if (caller.id !== targetUserId) {
      return new Response(JSON.stringify({ error: "Cannot report a milestone for another user" }), { status: 403 });
    }
    if (!badgeKey) {
      return new Response(JSON.stringify({ error: "badgeKey is required for milestone notifications" }), { status: 400 });
    }
    // Idempotent: if this badge was already awarded, don't re-notify.
    const { data: inserted, error: insertError } = await admin
      .from("user_badges")
      .insert({ user_id: caller.id, badge_key: badgeKey })
      .select()
      .maybeSingle();
    if (insertError) {
      // Unique violation = already awarded - not an error, just a no-op.
      if (insertError.code === "23505") {
        return new Response(JSON.stringify({ success: true, alreadyAwarded: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: insertError.message }), { status: 500 });
    }
    if (!inserted) {
      return new Response(JSON.stringify({ success: true, alreadyAwarded: true }), { status: 200 });
    }
  } else if (type === "like") {
    if (caller.id === targetUserId) {
      return new Response(JSON.stringify({ success: true, selfAction: true }), { status: 200 });
    }
    const query = admin.from("likes").select("id, hike_id, hikes!inner(user_id)").eq("user_id", caller.id).eq("hikes.user_id", targetUserId).limit(1);
    const { data: likeRows } = hikeId ? await query.eq("hike_id", hikeId) : await query;
    if (!likeRows || likeRows.length === 0) {
      return new Response(JSON.stringify({ error: "No matching like found for caller -> target" }), { status: 403 });
    }
  } else if (type === "follow") {
    if (caller.id === targetUserId) {
      return new Response(JSON.stringify({ success: true, selfAction: true }), { status: 200 });
    }
    const { data: followRows } = await admin
      .from("follows")
      .select("id")
      .eq("follower_id", caller.id)
      .eq("following_id", targetUserId)
      .limit(1);
    if (!followRows || followRows.length === 0) {
      return new Response(JSON.stringify({ error: "No matching follow found for caller -> target" }), { status: 403 });
    }
  }

  const prefColumn = type === "like" ? "notif_likes" : type === "follow" ? "notif_follows" : "notif_milestones";
  const { data: targetProfile } = await admin
    .from("profiles")
    .select(`id, ${prefColumn}`)
    .eq("id", targetUserId)
    .maybeSingle();

  if (!targetProfile || targetProfile[prefColumn] === false) {
    return new Response(JSON.stringify({ success: true, skipped: "preference_disabled" }), { status: 200 });
  }

  const { data: tokenRows } = await admin.from("push_tokens").select("token").eq("user_id", targetUserId);
  const tokens = (tokenRows || []).map((r) => r.token).filter(Boolean);
  if (tokens.length === 0) {
    return new Response(JSON.stringify({ success: true, skipped: "no_push_tokens" }), { status: 200 });
  }

  const messages = tokens.map((to) => ({
    to,
    title,
    body: message,
    data: { type, ...(data || {}) },
    sound: "default",
  }));

  const expoRes = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(messages),
  });

  const expoResult = await expoRes.json().catch(() => null);

  return new Response(JSON.stringify({ success: true, expoResult }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
