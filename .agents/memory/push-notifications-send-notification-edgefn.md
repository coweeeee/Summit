---
name: Push notification delivery via existing edge function
description: How real push notifications (likes, follows, comments, milestones) are actually sent in the mobile app — call the pre-deployed Supabase edge function, don't build a new sender.
---

Push notifications are delivered by invoking the already-deployed Supabase edge function `send-notification` directly from the mobile client (`supabase.functions.invoke("send-notification", { body: {...} })`), right after the triggering insert (like/follow/comment) or after a milestone is newly reached.

**Why:** The edge function already handles preference-checking (`notif_*` columns on `profiles`), push token lookup, and the actual Expo push send server-side. Building a separate backend sender (e.g. in the `api-server` artifact) or requesting a Supabase service role key would duplicate that logic unnecessarily.

**How to apply:** The payload shape is `{ targetUserId, type: 'like'|'follow'|'comment'|'milestone', title, body, data?, badgeKey?, hikeId? }`. A thin wrapper lives at `artifacts/mobile/lib/notifications.ts` (`sendPushNotification`) — reuse it rather than calling `supabase.functions.invoke` ad hoc. Skip sending when the actor is the same user as the recipient (e.g. don't notify yourself for your own like).
