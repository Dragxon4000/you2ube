"use client";

import { useEffect, useState } from "react";

interface Achievement {
  id: number;
  code: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  tier: string;
  requirementType: string;
  requirementValue: number;
  xpReward: number;
  progress: number;
  unlocked: boolean;
  unlockedAt: string | null;
}

interface Stats {
  xp: number;
  level: number;
  videosWatched: number;
  partiesHosted: number;
  friendsInvited: number;
}

const tierStyles: Record<string, string> = {
  bronze: "bg-amber-700 text-white",
  silver: "bg-slate-400 text-white",
  gold: "bg-gradient-to-r from-amber-400 to-yellow-500 text-white",
  diamond: "bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 text-white",
};

const categoryLabels: Record<string, { label: string; icon: string }> = {
  watching: { label: "Watching", icon: "📺" },
  social: { label: "Social", icon: "👥" },
  progression: { label: "Progression", icon: "📈" },
  general: { label: "General", icon: "🎯" },
};

export function AchievementsPanel() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/achievements", { signal: controller.signal })
      .then(r => r.json())
      .then(d => {
        if (!controller.signal.aborted) {
          setAchievements(d.achievements);
          setStats(d.userStats);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          // Surface a non-fatal "failed to load" state instead of hanging forever.
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, []);

  if (loading || !stats) {
    return (
      <div className="rounded-3xl bg-white p-8 shadow-lg">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-slate-200"></div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-slate-100"></div>
          ))}
        </div>
      </div>
    );
  }

  const filtered = filter === "all" ? achievements : filter === "unlocked" ? achievements.filter(a => a.unlocked) : filter === "locked" ? achievements.filter(a => !a.unlocked) : achievements.filter(a => a.category === filter);

  const categories = Array.from(new Set(achievements.map(a => a.category)));
  const unlockedCount = achievements.filter(a => a.unlocked).length;

  return (
    <div className="space-y-6">
      {/* Stats Header */}
      <div className="rounded-3xl bg-gradient-to-r from-emerald-500 to-teal-600 p-8 text-white shadow-xl">
        <h2 className="text-3xl font-bold">🏆 Achievements</h2>
        <p className="mt-2 text-white/90">
          {unlockedCount} of {achievements.length} unlocked
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-xl bg-white/20 p-3 text-center backdrop-blur">
            <div className="text-2xl font-bold">{stats.level}</div>
            <div className="text-xs opacity-90">Level</div>
          </div>
          <div className="rounded-xl bg-white/20 p-3 text-center backdrop-blur">
            <div className="text-2xl font-bold">{stats.xp.toLocaleString()}</div>
            <div className="text-xs opacity-90">XP</div>
          </div>
          <div className="rounded-xl bg-white/20 p-3 text-center backdrop-blur">
            <div className="text-2xl font-bold">{stats.videosWatched}</div>
            <div className="text-xs opacity-90">Videos</div>
          </div>
          <div className="rounded-xl bg-white/20 p-3 text-center backdrop-blur">
            <div className="text-2xl font-bold">{stats.partiesHosted}</div>
            <div className="text-xs opacity-90">Parties</div>
          </div>
          <div className="rounded-xl bg-white/20 p-3 text-center backdrop-blur">
            <div className="text-2xl font-bold">{stats.friendsInvited}</div>
            <div className="text-xs opacity-90">Friends</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-3xl bg-white p-4 shadow-lg">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              filter === "all" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            All ({achievements.length})
          </button>
          <button
            onClick={() => setFilter("unlocked")}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              filter === "unlocked" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Unlocked ({unlockedCount})
          </button>
          <button
            onClick={() => setFilter("locked")}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              filter === "locked" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            Locked ({achievements.length - unlockedCount})
          </button>
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                filter === c ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {categoryLabels[c]?.icon ?? "🎯"} {categoryLabels[c]?.label ?? c}
            </button>
          ))}
        </div>
      </div>

      {/* Achievements List */}
      <div className="space-y-3">
        {filtered.map(a => {
          const pct = Math.min(100, Math.round((a.progress / a.requirementValue) * 100));
          return (
            <div
              key={a.id}
              className={`rounded-2xl bg-white p-5 shadow-lg transition-all ${
                a.unlocked ? "border-l-4 border-green-500" : "opacity-80"
              }`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl text-3xl shadow-md ${
                    a.unlocked
                      ? tierStyles[a.tier] ?? "bg-slate-200"
                      : "bg-slate-200 grayscale"
                  }`}
                >
                  {a.unlocked ? a.icon : "🔒"}
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-900">{a.name}</h4>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${tierStyles[a.tier] ?? "bg-slate-200 text-slate-700"}`}>
                          {a.tier}
                        </span>
                        {a.unlocked && <span className="text-green-500">✓</span>}
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{a.description}</p>
                    </div>
                    {a.xpReward > 0 && (
                      <div className="rounded-lg bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700">
                        +{a.xpReward} XP
                      </div>
                    )}
                  </div>

                  {!a.unlocked && (
                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                        <span>{a.progress} / {a.requirementValue}</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {a.unlocked && a.unlockedAt && (
                    <div className="mt-2 text-xs text-slate-500">
                      Unlocked on {new Date(a.unlockedAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
