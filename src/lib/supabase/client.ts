"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;

export type SocialRealtimePayload = {
  event?: "friend_request_changed" | "friendship_changed" | "presence_changed" | "activity_changed";
};

export function isSupabaseRealtimeConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!isSupabaseRealtimeConfigured()) return null;
  if (cachedClient) return cachedClient;

  cachedClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );

  return cachedClient;
}

/**
 * Subscribes to a user-scoped Supabase Realtime Broadcast channel. Broadcast
 * payloads are invalidation-only; private rows are always refetched through
 * session-authorized Next.js routes.
 */
export function subscribeToSocialUpdates(
  userId: string,
  onUpdate: (payload: SocialRealtimePayload) => void,
): (() => void) | null {
  const client = getSupabaseBrowserClient();
  if (!client) return null;

  const channel = client
    .channel(`social-user:${userId}`)
    .on("broadcast", { event: "social_update" }, ({ payload }) => {
      onUpdate((payload ?? {}) as SocialRealtimePayload);
    });

  channel.subscribe((status) => {
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      console.warn("[supabase-realtime] Social channel unavailable:", status);
    }
  });

  return () => {
    void client.removeChannel(channel);
  };
}
