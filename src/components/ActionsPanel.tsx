"use client";

import { useEffect, useState } from "react";
import { showNotification } from "@/lib/desktop";

interface Video {
  id: number;
  title: string;
  thumbnailEmoji: string;
  durationSec: number;
  viewsCount: number;
}

interface ActionResult {
  success: boolean;
  xpGained?: number;
  leveledUp?: boolean;
  newLevel?: number;
  newAchievements?: Array<{ name: string; icon: string }>;
  newBadges?: Array<{ name: string; icon: string }>;
  message?: string;
}

export function ActionsPanel({ onAction }: { onAction: () => void }) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);
  const [partyTitle, setPartyTitle] = useState("");
  const [partyAttendees, setPartyAttendees] = useState(3);
  const [friendUsername, setFriendUsername] = useState("");

  useEffect(() => {
    fetch("/api/videos")
      .then(r => r.json())
      .then(d => {
        setVideos(d.videos);
        setLoading(false);
      });
  }, []);

  const handleWatch = async (videoId: number) => {
    const res = await fetch("/api/actions/watch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId }),
    });
    const data = await res.json();
    if (data.success) {
      setActionResult({
        success: true,
        xpGained: data.result?.xpGained ?? 0,
        leveledUp: data.result?.leveledUp,
        newLevel: data.result?.newLevel,
        newAchievements: data.result?.newAchievements,
        newBadges: data.result?.newBadges,
        message: data.alreadyWatchedToday ? data.message : undefined,
      });

      // Native OS notification for the XP gain (desktop-only, silent no-op on web).
      if (data.result?.xpGained > 0 && !data.alreadyWatchedToday) {
        const parts = [`+${data.result.xpGained} XP`];
        if (data.result.leveledUp) parts.push(`Level ${data.result.newLevel}!`);
        if (data.result.newAchievements?.length) parts.push(`${data.result.newAchievements.length} achievement${data.result.newAchievements.length === 1 ? "" : "s"}`);
        void showNotification({
          title: data.result.leveledUp ? `🎉 Level Up!` : `✨ XP Earned`,
          body: parts.join(" · "),
        });
      }

      onAction();
      setTimeout(() => setActionResult(null), 5000);
    }
  };

  const handleHostParty = async () => {
    if (!partyTitle.trim()) return;
    const res = await fetch("/api/actions/host-party", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: partyTitle, attendeeCount: partyAttendees }),
    });
    const data = await res.json();
    if (data.success) {
      setActionResult({
        success: true,
        xpGained: data.result?.xpGained,
        leveledUp: data.result?.leveledUp,
        newLevel: data.result?.newLevel,
        newAchievements: data.result?.newAchievements,
        newBadges: data.result?.newBadges,
      });
      setPartyTitle("");
      onAction();
      setTimeout(() => setActionResult(null), 5000);
    }
  };

  const handleInviteFriend = async () => {
    if (!friendUsername.trim()) return;
    const res = await fetch("/api/actions/invite-friend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteeUsername: friendUsername }),
    });
    const data = await res.json();
    if (data.success) {
      setActionResult({
        success: true,
        xpGained: data.result?.xpGained,
        leveledUp: data.result?.leveledUp,
        newLevel: data.result?.newLevel,
        newAchievements: data.result?.newAchievements,
        newBadges: data.result?.newBadges,
      });
      setFriendUsername("");
      onAction();
      setTimeout(() => setActionResult(null), 5000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Result Toast */}
      {actionResult && actionResult.success && (
        <div className="rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 p-6 text-white shadow-xl">
          <div className="flex items-center gap-3">
            <div className="text-3xl">🎉</div>
            <div className="flex-1">
              <div className="text-lg font-bold">
                {actionResult.message ?? `+${actionResult.xpGained} XP earned!`}
              </div>
              {actionResult.leveledUp && (
                <div className="mt-1 text-sm">
                  🎊 Level Up! You're now level {actionResult.newLevel}
                </div>
              )}
              {actionResult.newAchievements && actionResult.newAchievements.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {actionResult.newAchievements.map((a, i) => (
                    <span key={i} className="rounded-full bg-white/20 px-3 py-1 text-xs">
                      {a.icon} {a.name}
                    </span>
                  ))}
                </div>
              )}
              {actionResult.newBadges && actionResult.newBadges.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {actionResult.newBadges.map((b, i) => (
                    <span key={i} className="rounded-full bg-white/20 px-3 py-1 text-xs">
                      {b.icon} {b.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Watch Videos */}
      <div className="rounded-3xl bg-white p-6 shadow-lg">
        <h3 className="mb-4 text-xl font-bold text-slate-900">📺 Watch Videos</h3>
        <p className="mb-4 text-sm text-slate-600">
          Watch videos to earn XP. You can earn XP from each video once per day.
        </p>
        {loading ? (
          <div className="text-slate-500">Loading videos...</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map(v => (
              <button
                key={v.id}
                onClick={() => handleWatch(v.id)}
                className="group flex items-center gap-3 rounded-xl border-2 border-slate-200 p-4 text-left transition-all hover:border-indigo-500 hover:bg-indigo-50 hover:shadow-md"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-2xl group-hover:bg-white">
                  {v.thumbnailEmoji}
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="truncate font-medium text-slate-900">{v.title}</div>
                  <div className="text-xs text-slate-500">{v.viewsCount} views</div>
                </div>
                <div className="text-xs font-semibold text-indigo-600">+25 XP</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Host Watch Party */}
      <div className="rounded-3xl bg-white p-6 shadow-lg">
        <h3 className="mb-4 text-xl font-bold text-slate-900">🎉 Host Watch Party</h3>
        <p className="mb-4 text-sm text-slate-600">
          Host a watch party to earn XP. Base: 75 XP + 10 XP per attendee.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={partyTitle}
            onChange={e => setPartyTitle(e.target.value)}
            placeholder="Party title (e.g., Movie Night!)"
            className="flex-1 rounded-xl border-2 border-slate-200 px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
          />
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">Attendees:</label>
            <input
              type="number"
              min="0"
              max="50"
              value={partyAttendees}
              onChange={e => setPartyAttendees(parseInt(e.target.value, 10))}
              className="w-20 rounded-xl border-2 border-slate-200 px-3 py-3 text-center text-slate-900 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <button
            onClick={handleHostParty}
            disabled={!partyTitle.trim()}
            className="rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white shadow-md transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Host Party
          </button>
        </div>
      </div>

      {/* Invite Friend */}
      <div className="rounded-3xl bg-white p-6 shadow-lg">
        <h3 className="mb-4 text-xl font-bold text-slate-900">👋 Invite a Friend</h3>
        <p className="mb-4 text-sm text-slate-600">
          Invite friends to you2ube and earn 50 XP when they join.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={friendUsername}
            onChange={e => setFriendUsername(e.target.value)}
            placeholder="Friend's username"
            className="flex-1 rounded-xl border-2 border-slate-200 px-4 py-3 text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
          />
          <button
            onClick={handleInviteFriend}
            disabled={!friendUsername.trim()}
            className="rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white shadow-md transition-all hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send Invite
          </button>
        </div>
      </div>
    </div>
  );
}
