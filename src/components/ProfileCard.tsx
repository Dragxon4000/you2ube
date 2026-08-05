"use client";

import { useEffect, useState } from "react";

interface ProfileData {
  user: {
    id: number;
    username: string;
    displayName: string;
    avatarEmoji: string;
    bio: string;
    xp: number;
    level: number;
    totalVideosWatched: number;
    totalPartiesHosted: number;
    totalFriendsInvited: number;
    createdAt: string;
  };
  level: {
    level: number;
    title: string;
    colorHex: string;
    perk: string;
  };
  progress: {
    currentXp: number;
    currentLevelMin: number;
    nextLevelMin: number;
    xpIntoLevel: number;
    xpNeededForLevel: number;
    percent: number;
    nextLevel: number | null;
    nextTitle: string | null;
  };
  ownedBadges: Array<{
    id: number;
    code: string;
    name: string;
    icon: string;
    tier: string;
  }>;
  claimedRewards: Array<{
    id: number;
    name: string;
    icon: string;
  }>;
  achievements: {
    unlocked: number;
    total: number;
  };
  recentTransactions: Array<{
    id: number;
    amount: number;
    reason: string;
    createdAt: string;
  }>;
  unreadNotifications: number;
  discord: {
    linked: boolean;
    username?: string;
    globalName?: string | null;
    avatarUrl?: string;
  };
}

export function ProfileCard() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/profile")
      .then(r => r.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return (
      <div
        aria-busy="true"
        aria-label="Loading profile"
        className="rounded-3xl bg-white p-8 shadow-lg"
      >
        <div className="animate-pulse space-y-4" aria-hidden="true">
          <div className="h-20 w-20 rounded-full bg-slate-200"></div>
          <div className="h-6 w-48 rounded bg-slate-200"></div>
          <div className="h-4 w-64 rounded bg-slate-200"></div>
        </div>
        <span className="sr-only">Loading your profile…</span>
      </div>
    );
  }

  const { user, level, progress, ownedBadges, achievements, discord } = data;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Main Profile Card */}
      <div className="rounded-3xl bg-white p-8 shadow-lg lg:col-span-2">
        <div className="flex items-start gap-6">
          {/* Avatar — Discord image when linked, else emoji */}
          {discord.linked && discord.avatarUrl ? (
            <img
              src={discord.avatarUrl}
              alt={discord.globalName ?? discord.username}
              className="h-24 w-24 rounded-full object-cover shadow-lg ring-4"
              style={{ borderColor: level.colorHex, boxShadow: `0 0 0 4px ${level.colorHex}30` }}
            />
          ) : (
            <div
              className="flex h-24 w-24 items-center justify-center rounded-full text-5xl shadow-lg"
              style={{ backgroundColor: level.colorHex + "20", border: `4px solid ${level.colorHex}` }}
            >
              {user.avatarEmoji}
            </div>
          )}

          {/* User Info */}
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-slate-900">{user.displayName}</h2>
            <p className="text-sm text-slate-500">@{user.username}</p>
            {discord.linked && (
              <p className="text-xs text-indigo-600">
                🎮 {discord.globalName ?? discord.username}
              </p>
            )}
            <p className="mt-2 text-slate-700">{user.bio}</p>

            {/* Level Badge */}
            <div className="mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-md" style={{ backgroundColor: level.colorHex }}>
              <span>Level {user.level}</span>
              <span className="opacity-80">•</span>
              <span>{level.title}</span>
            </div>
          </div>
        </div>

          {/* XP Progress Bar */}
          <div className="mt-8" aria-label={`Level progress: ${progress.percent}% toward level ${progress.nextLevel ?? 'max'}`}>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">
                <span id="xp-current">{progress.xpIntoLevel}</span> / <span id="xp-needed">{progress.xpNeededForLevel}</span> XP
              </span>
              {progress.nextLevel && (
                <span className="text-slate-500">
                  Next: Level {progress.nextLevel} — {progress.nextTitle}
                </span>
              )}
            </div>
            <div
              role="progressbar"
              aria-valuenow={progress.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`XP progress: ${progress.percent}%`}
              className="h-4 overflow-hidden rounded-full bg-slate-200"
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progress.percent}%`,
                  backgroundColor: level.colorHex,
                }}
              />
            </div>
            <div className="mt-1 text-right text-xs text-slate-500">{progress.percent}% to next level</div>
          </div>

        {/* Stats Grid */}
        <div className="mt-8 grid grid-cols-3 gap-4">
          <div className="rounded-xl bg-slate-50 p-4 text-center">
            <div className="text-2xl font-bold text-slate-900">{user.totalVideosWatched}</div>
            <div className="text-xs text-slate-600">Videos Watched</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 text-center">
            <div className="text-2xl font-bold text-slate-900">{user.totalPartiesHosted}</div>
            <div className="text-xs text-slate-600">Parties Hosted</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 text-center">
            <div className="text-2xl font-bold text-slate-900">{user.totalFriendsInvited}</div>
            <div className="text-xs text-slate-600">Friends Invited</div>
          </div>
        </div>

        {/* Total XP */}
        <div className="mt-6 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 p-6 text-white shadow-lg">
          <div className="text-sm font-medium opacity-90">Total XP Earned</div>
          <div className="text-4xl font-bold">{user.xp.toLocaleString()}</div>
        </div>
      </div>

      {/* Side Panel: Badges & Achievements */}
      <div className="space-y-6">
        {/* Badges Preview */}
        <div className="rounded-3xl bg-white p-6 shadow-lg">
          <h3 className="mb-4 text-lg font-semibold text-slate-900">Your Badges</h3>
          {ownedBadges.length === 0 ? (
            <p className="text-sm text-slate-500">No badges yet. Keep exploring!</p>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {ownedBadges.slice(0, 8).map(b => (
                <div key={b.id} className="flex flex-col items-center" title={b.name}>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-orange-200 text-2xl shadow-md">
                    {b.icon}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Achievements Preview */}
        <div className="rounded-3xl bg-white p-6 shadow-lg">
          <h3 className="mb-4 text-lg font-semibold text-slate-900">Achievements</h3>
          <div className="text-center">
            <div className="text-3xl font-bold text-slate-900">
              {achievements.unlocked} / {achievements.total}
            </div>
            <div className="text-sm text-slate-600">Unlocked</div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all"
                style={{ width: `${(achievements.unlocked / achievements.total) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Current Perk */}
        {level.perk && (
          <div className="rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 p-6 text-white shadow-lg">
            <div className="text-sm font-medium opacity-90">Current Perk</div>
            <div className="mt-1 text-lg font-semibold">{level.perk}</div>
          </div>
        )}
      </div>
    </div>
  );
}
