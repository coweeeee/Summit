import { supabase } from "@/lib/supabase";

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

export async function sendPushNotification(payload: SendNotificationPayload) {
  try {
    await supabase.functions.invoke("send-notification", { body: payload });
  } catch (err) {
    console.warn("send-notification failed", err);
  }
}
