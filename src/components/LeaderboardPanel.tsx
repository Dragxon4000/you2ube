"use client";

import { useEffect, useState } from "react";

interface LeaderboardEntry {
  rank: number;
  id: number;
  username: string;
  displayName: string;
  avatarEmoji: string;
  xp: number;
  level: number;
  levelTitle: string;
  levelColor: string;
}

export function LeaderboardPanel() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [yourUserId, setYourUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/leaderboard", { signal: controller.signal })
      .then(r => r.json())
      .then(d => {
        if (!controller.signal.aborted) {
          setEntries(d.leaderboard);
          setYourUserId(d.yourUserId);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") setLoading(false);
      });
    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <div className="rounded-3xl bg-white p-8 shadow-lg">
        <div className="animate-pulse space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 rounded-2xl bg-slate-100"></div>
          ))}
        </div>
      </div>
    );
  }

  const rankIcon = (rank: number) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `#${rank}`;
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-r from-yellow-500 via-orange-500 to-red-500 p-8 text-white shadow-xl">
        <h2 className="text-3xl font-bold">📊 Leaderboard</h2>
        <p className="mt-2 text-white/90">Top you2ubers ranked by total XP earned.</p>
      </div>

      <div className="rounded-3xl bg-white p-6 shadow-lg">
        <div className="space-y-2">
          {entries.map(e => {
            const isYou = e.id === yourUserId;
            return (
              <div
                key={e.id}
                className={`flex items-center gap-4 rounded-2xl p-4 transition-all ${
                  isYou
                    ? "bg-gradient-to-r from-indigo-50 to-purple-50 ring-2 ring-indigo-300"
                    : "bg-slate-50 hover:bg-slate-100"
                }`}
              >
                <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-white text-2xl font-bold shadow-md">
                  {rankIcon(e.rank)}
                </div>
                <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full text-3xl shadow" style={{ backgroundColor: e.levelColor + "20", border: `3px solid ${e.levelColor}` }}>
                  {e.avatarEmoji}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">{e.displayName}</span>
                    {isYou && (
                      <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-semibold text-white">
                        YOU
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">@{e.username}</div>
                </div>
                <div className="text-right">
                  <div
                    className="inline-block rounded-full px-3 py-1 text-xs font-semibold text-white"
                    style={{ backgroundColor: e.levelColor }}
                  >
                    Lv {e.level} · {e.levelTitle}
                  </div>
                  <div className="mt-1 text-lg font-bold text-slate-900">
                    {e.xp.toLocaleString()} XP
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
