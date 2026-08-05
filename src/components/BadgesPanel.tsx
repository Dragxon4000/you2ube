"use client";

import { useEffect, useState } from "react";

interface Badge {
  id: number;
  code: string;
  name: string;
  description: string;
  icon: string;
  tier: string;
  requirementText: string;
  owned: boolean;
  awardedAt: string | null;
}

const tierColors: Record<string, string> = {
  common: "from-slate-400 to-slate-500",
  rare: "from-blue-400 to-blue-600",
  epic: "from-purple-500 to-fuchsia-600",
  legendary: "from-amber-400 via-orange-500 to-red-500",
};

export function BadgesPanel() {
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/badges", { signal: controller.signal })
      .then(r => r.json())
      .then(d => {
        if (!controller.signal.aborted) {
          setBadges(d.badges);
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
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-slate-200"></div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-40 rounded-2xl bg-slate-100"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const owned = badges.filter(b => b.owned);
  const locked = badges.filter(b => !b.owned);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 p-8 text-white shadow-xl">
        <h2 className="text-3xl font-bold">🎖️ Badge Collection</h2>
        <p className="mt-2 text-white/90">
          {owned.length} of {badges.length} badges earned. Keep exploring to unlock more!
        </p>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full rounded-full bg-white transition-all"
            style={{ width: `${(owned.length / badges.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="rounded-3xl bg-white p-6 shadow-lg">
        <h3 className="mb-4 text-xl font-bold text-slate-900">Your Badges</h3>
        {owned.length === 0 ? (
          <p className="text-slate-500">No badges yet. Start watching videos and hosting parties!</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {owned.map(b => (
              <div
                key={b.id}
                className="group rounded-2xl border-2 border-slate-200 p-5 text-center transition-all hover:border-indigo-400 hover:shadow-lg"
              >
                <div className={`mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br ${tierColors[b.tier] ?? tierColors.common} text-4xl shadow-lg`}>
                  {b.icon}
                </div>
                <div className="font-semibold text-slate-900">{b.name}</div>
                <div className="mt-1 text-xs capitalize text-indigo-600">{b.tier}</div>
                <div className="mt-2 text-xs text-slate-500">{b.description}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {locked.length > 0 && (
        <div className="rounded-3xl bg-white p-6 shadow-lg">
          <h3 className="mb-4 text-xl font-bold text-slate-900">Locked Badges</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {locked.map(b => (
              <div key={b.id} className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center opacity-70">
                <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-slate-200 text-4xl">
                  🔒
                </div>
                <div className="font-semibold text-slate-700">{b.name}</div>
                <div className="mt-1 text-xs capitalize text-slate-500">{b.tier}</div>
                <div className="mt-2 text-xs text-slate-600">{b.requirementText}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
