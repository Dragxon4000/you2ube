import "server-only";

import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/lib/supabase/admin";

export const SOCIAL_REALTIME_EVENT = "social_update";

export type SocialRealtimeEvent =
  | "friend_request_changed"
  | "friendship_changed"
  | "presence_changed"
  | "activity_changed";

/**
 * Broadcasts an invalidation signal through Supabase Realtime. The payload
 * intentionally contains no private social rows. The browser receives the
 * signal and refetches through an authenticated Next.js API route.
 */
export async function broadcastSocialUpdate(
  userIds: string[],
  event: SocialRealtimeEvent,
): Promise<void> {
  if (!isSupabaseAdminConfigured()) return;

  const uniqueUserIds = [...new Set(userIds)].filter(Boolean);
  if (uniqueUserIds.length === 0) return;

  const supabase = getSupabaseAdminClient();
  await Promise.all(
    uniqueUserIds.map(async (userId) => {
      const channel = supabase.channel(`social-user:${userId}`);
      try {
        await channel.send({
          type: "broadcast",
          event: SOCIAL_REALTIME_EVENT,
          payload: { event },
        });
      } catch (error) {
        console.error("[supabase-realtime] Broadcast failed:", error);
      } finally {
        await supabase.removeChannel(channel);
      }
    }),
  );
}
