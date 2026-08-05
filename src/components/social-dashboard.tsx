"use client";

import { useCallback, useEffect, useState } from "react";
import { subscribeToSocialUpdates } from "@/lib/supabase/client";

type UserSummary = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
};

type FriendRequest = {
  id: string;
  createdAt: string;
  message: string | null;
  sender: UserSummary;
  receiver: UserSummary | null;
};

type Friend = {
  id: string;
  friendId: string;
  createdAt: string;
  friend: UserSummary;
  presence: {
    status: "online" | "away" | "offline";
    lastSeen: string;
    currentVideoId: string | null;
    currentVideoTitle: string | null;
    customStatus: string | null;
  };
};

type ActivityItem = {
  id: string;
  userId: string;
  type:
    | "watch_start"
    | "watch_complete"
    | "achievement_unlock"
    | "level_up"
    | "friend_added";
  metadata: { friendId?: string; friendName?: string; videoTitle?: string; level?: number } | null;
  createdAt: string;
  user: UserSummary;
};

type SearchUser = UserSummary;

type SocialData = {
  friends: Friend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
};

type Tab = "friends" | "requests" | "feed" | "history" | "online";

function initials(name: string): string {
  return name.slice(0, 1).toUpperCase();
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function describeActivity(item: ActivityItem): string {
  switch (item.type) {
    case "watch_complete":
      return `finished watching ${item.metadata?.videoTitle ? `"${item.metadata.videoTitle}"` : "a video"}`;
    case "watch_start":
      return `started watching ${item.metadata?.videoTitle ? `"${item.metadata.videoTitle}"` : "a video"}`;
    case "friend_added":
      return item.metadata?.friendName
        ? `became friends with ${item.metadata.friendName}`
        : "added a new friend";
    case "level_up":
      return item.metadata?.level ? `reached level ${item.metadata.level}` : "leveled up";
    case "achievement_unlock":
      return "unlocked an achievement";
    default:
      return "did something";
  }
}

function presenceBadge(status: Friend["presence"]["status"]) {
  if (status === "online") return <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-label="online" />;
  if (status === "away") return <span className="h-2.5 w-2.5 rounded-full bg-amber-400" aria-label="away" />;
  return <span className="h-2.5 w-2.5 rounded-full bg-slate-600" aria-label="offline" />;
}

export function SocialDashboard({ currentUserId }: { currentUserId: string }) {
  const [tab, setTab] = useState<Tab>("friends");
  const [data, setData] = useState<SocialData>({ friends: [], incoming: [], outgoing: [] });
  const [feed, setFeed] = useState<ActivityItem[]>([]);
  const [history, setHistory] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add friend state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [addMessage, setAddMessage] = useState<string | null>(null);

  const fetchSocial = useCallback(async () => {
    try {
      const [socialRes, feedRes, historyRes] = await Promise.all([
        fetch("/api/social/friends"),
        fetch("/api/social/feed"),
        fetch("/api/social/activity"),
      ]);
      if (!socialRes.ok) throw new Error("Failed to load friends.");
      if (!feedRes.ok) throw new Error("Failed to load feed.");
      if (!historyRes.ok) throw new Error("Failed to load activity history.");
      const [socialJson, feedJson, historyJson] = await Promise.all([
        socialRes.json(),
        feedRes.json(),
        historyRes.json(),
      ]);
      setData({
        friends: socialJson.friends ?? [],
        incoming: socialJson.incoming ?? [],
        outgoing: socialJson.outgoing ?? [],
      });
      setFeed(feedJson.feed ?? []);
      setHistory(historyJson.history ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load social data.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Presence heartbeat + social data load
  useEffect(() => {
    void fetch("/api/social/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "online" }),
    });
    void fetchSocial();

    const heartbeat = window.setInterval(() => {
      void fetch("/api/social/presence", { method: "PATCH" });
    }, 45_000);

    const unsubscribeRealtime = subscribeToSocialUpdates(currentUserId, () => {
      void fetchSocial();
    });

    // Polling remains a graceful fallback for missing/unavailable Supabase Realtime.
    const refreshInterval = window.setInterval(() => {
      void fetchSocial();
    }, 30_000);

    const onBeforeUnload = () => {
      try {
        navigator.sendBeacon(
          "/api/social/presence",
          new Blob([JSON.stringify({ status: "offline" })], { type: "application/json" }),
        );
      } catch {
        // ignore
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      window.clearInterval(heartbeat);
      window.clearInterval(refreshInterval);
      unsubscribeRealtime?.();
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [currentUserId, fetchSocial]);

  async function handleSearchUsers(query: string) {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/social/users/search?q=${encodeURIComponent(query)}`);
      const json = await res.json();
      setSearchResults(json.users ?? []);
    } finally {
      setSearching(false);
    }
  }

  async function sendRequest(toUserId: string) {
    setAddMessage(null);
    const res = await fetch("/api/social/friends/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receiverId: toUserId }),
    });
    const json = await res.json();
    if (!res.ok) {
      setAddMessage(json.error ?? "Failed to send friend request.");
      return;
    }
    setAddMessage("Friend request sent.");
    await fetchSocial();
    setSearchResults(searchResults.filter((u) => u.id !== toUserId));
  }

  async function acceptRequest(requestId: string) {
    await fetch(`/api/social/requests/${requestId}/accept`, { method: "POST" });
    await fetchSocial();
  }

  async function rejectRequest(requestId: string) {
    await fetch(`/api/social/requests/${requestId}/reject`, { method: "POST" });
    await fetchSocial();
  }

  async function cancelRequest(requestId: string) {
    await fetch(`/api/social/requests/${requestId}/cancel`, { method: "POST" });
    await fetchSocial();
  }

  async function removeFriend(friendId: string) {
    if (!window.confirm("Remove this friend?")) return;
    await fetch(`/api/social/friends?friendId=${encodeURIComponent(friendId)}`, { method: "DELETE" });
    await fetchSocial();
  }

  if (loading) {
    return (
      <div className="grid place-items-center rounded-2xl border border-slate-800 bg-slate-900 p-10 text-slate-400">
        Loading social data…
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-4 rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">{error}</div>
      )}

      <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-800 pb-2">
        {(["friends", "requests", "feed", "history", "online"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-t-lg px-4 py-2 text-sm font-semibold capitalize transition ${
              tab === t ? "border-x border-t border-slate-800 bg-slate-900 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            {t}
            {t === "requests" && data.incoming.length > 0 && (
              <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs text-white">
                {data.incoming.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "friends" && (
        <section className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-lg font-semibold text-white">Add friend</h2>
            <p className="mt-1 text-sm text-slate-400">Search by email or display name.</p>
            <input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                void handleSearchUsers(e.target.value);
              }}
              placeholder="Email or display name"
              className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
            />
            {addMessage && <p className="mt-3 text-sm text-emerald-300">{addMessage}</p>}
            {searching && <p className="mt-3 text-sm text-slate-500">Searching…</p>}
            {searchResults.length > 0 && (
              <ul className="mt-4 space-y-2">
                {searchResults.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-slate-800 text-xs font-bold text-slate-300">
                        {u.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={u.avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          initials(u.displayName || u.email)
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{u.displayName}</p>
                        <p className="truncate text-xs text-slate-400">{u.email}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => sendRequest(u.id)}
                      className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500"
                    >
                      Add
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-lg font-semibold text-white">Your friends ({data.friends.length})</h2>
            {data.friends.length === 0 ? (
              <p className="mt-3 text-sm text-slate-400">
                No friends yet. Search for someone above to get started.
              </p>
            ) : (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {data.friends.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-slate-800 text-xs font-bold text-slate-300">
                        {f.friend.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={f.friend.avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          initials(f.friend.displayName || f.friend.email)
                        )}
                        <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-slate-950 p-0.5">
                          {presenceBadge(f.presence.status)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{f.friend.displayName}</p>
                        <p className="truncate text-xs text-slate-400">
                          {f.presence.status === "online"
                            ? f.presence.currentVideoTitle
                              ? `Watching ${f.presence.currentVideoTitle}`
                              : f.presence.customStatus || "Online now"
                            : `Last seen ${timeAgo(f.presence.lastSeen)}`}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => removeFriend(f.friendId)}
                      className="shrink-0 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-slate-800 hover:text-red-300"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {tab === "requests" && (
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-lg font-semibold text-white">Incoming requests</h2>
            {data.incoming.length === 0 ? (
              <p className="mt-3 text-sm text-slate-400">No incoming friend requests.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {data.incoming.map((req) => (
                  <li key={req.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-slate-800 text-xs font-bold text-slate-300">
                        {req.sender.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={req.sender.avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          initials(req.sender.displayName || req.sender.email)
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">
                          {req.sender.displayName}
                        </p>
                        <p className="truncate text-xs text-slate-400">{req.sender.email}</p>
                        {req.message && <p className="mt-2 text-xs text-slate-400">&ldquo;{req.message}&rdquo;</p>}
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => acceptRequest(req.id)}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => rejectRequest(req.id)}
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                      >
                        Reject
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-lg font-semibold text-white">Outgoing requests</h2>
            {data.outgoing.length === 0 ? (
              <p className="mt-3 text-sm text-slate-400">No outgoing friend requests.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {data.outgoing.map((req) => (
                  <li key={req.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{req.receiver?.displayName ?? "Unknown user"}</p>
                      <p className="truncate text-xs text-slate-400">Sent {timeAgo(req.createdAt)}</p>
                    </div>
                    <button
                      onClick={() => cancelRequest(req.id)}
                      className="shrink-0 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {tab === "feed" && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-lg font-semibold text-white">Activity feed</h2>
          {feed.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">
              No activity yet. Watch videos and add friends to see your feed fill up.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {feed.map((item) => (
                <li key={item.id} className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-slate-800 text-xs font-bold text-slate-300">
                    {item.user.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.user.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      initials(item.user.displayName || item.user.email)
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white">
                      <span className="font-semibold">{item.user.displayName}</span>{" "}
                      <span className="text-slate-300">{describeActivity(item)}</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{timeAgo(item.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "history" && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-lg font-semibold text-white">Your activity history</h2>
          {history.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">Your activity history is empty.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {history.map((item) => (
                <li key={item.id} className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-800 text-xs font-bold text-slate-300">
                    {item.type === "watch_start" ? "▶" : item.type === "watch_complete" ? "✓" : item.type === "friend_added" ? "✦" : "★"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-200">{describeActivity(item)}</p>
                    <p className="mt-1 text-xs text-slate-500">{timeAgo(item.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "online" && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-lg font-semibold text-white">Online friends</h2>
          {data.friends.filter((f) => f.presence.status !== "offline").length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">No friends are currently online.</p>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.friends
                .filter((f) => f.presence.status !== "offline")
                .map((f) => (
                  <li key={f.id} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                    <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-slate-800 text-xs font-bold text-slate-300">
                      {f.friend.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.friend.avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        initials(f.friend.displayName || f.friend.email)
                      )}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-white">{f.friend.displayName}</p>
                      <p className="text-xs text-slate-400">
                        {f.presence.currentVideoTitle ? `Watching ${f.presence.currentVideoTitle}` : f.presence.customStatus || f.presence.status}
                      </p>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
