import { supabase } from "@/lib/supabase";

// Keep in step with the type list the `send-notification` edge function
// validates. They drifted once — the function accepted only like/follow/
// milestone while this type had already gained "comment" — and because the
// result was discarded, every comment notification 400'd in silence for as
// long as that lasted.
export type NotificationType = "like" | "follow" | "comment" | "milestone";

export type SendNotificationPayload = {
  targetUserId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  badgeKey?: string;
  hikeId?: string;
};

/**
 * Fire-and-forget by design: a notification that fails to send must never block
 * or undo the action that triggered it. The comment is still posted, the follow
 * still stands.
 *
 * But "don't block the user" is not the same as "don't tell anyone". Failures
 * are now logged loudly, because the previous version awaited the call and
 * threw the result away — and `functions.invoke` reports a non-2xx through its
 * returned `error` rather than by throwing, so the catch block never ran
 * either. A payload the function rejected produced no log, no alert and no
 * user-visible symptom; the notification simply never arrived.
 */
export async function sendPushNotification(payload: SendNotificationPayload) {
  try {
    const { data, error } = await supabase.functions.invoke("send-notification", {
      body: payload,
    });

    if (error) {
      // FunctionsHttpError carries the response, and its body holds the
      // function's own error string — far more useful than "non-2xx status".
      let detail: string;
      try {
        detail = JSON.stringify(await (error as any)?.context?.json?.());
      } catch {
        detail = String((error as any)?.message ?? error);
      }
      console.error(`send-notification failed [type=${payload.type}]`, detail);
      return { ok: false as const, error: detail };
    }

    // A 200 does not mean delivered. The function reports why it declined via
    // `skipped`, which is what separates "the target turned this category off"
    // from "nobody has registered a push token yet".
    if (data?.skipped) {
      console.warn(`send-notification skipped [type=${payload.type}]: ${data.skipped}`);
    }
    return { ok: true as const, data };
  } catch (err) {
    // Network-level failure: the request never got a response at all.
    console.error(`send-notification threw [type=${payload.type}]`, err);
    return { ok: false as const, error: String(err) };
  }
}
