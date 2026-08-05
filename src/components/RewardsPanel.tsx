"use client";

import { useEffect, useState } from "react";

interface Reward {
  id: number;
  code: string;
  name: string;
  description: string;
  icon: string;
  levelRequired: number;
  type: string;
  value: Record<string, unknown>;
  unlocked: boolean;
  claimed: boolean;
}

export function RewardsPanel({ onClaim }: { onClaim: () => void }) {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [userLevel, setUserLevel] = useState(1);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<number | null>(null);

  const load = () => {
    fetch("/api/rewards")
      .then(r => r.json())
      .then(d => {
        setRewards(d.rewards);
        setUserLevel(d.userLevel);
        setLoading(false);
      });
  };

  useEffect(() => { load(); }, []);

  const handleClaim = async (id: number) => {
    setClaiming(id);
    try {
      const res = await fetch(`/api/rewards/${id}/claim`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        load();
        onClaim();
      } else {
        alert(data.error ?? "Failed to claim");
      }
    } finally {
      setClaiming(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-3xl bg-white p-8 shadow-lg">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-slate-200"></div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-32 rounded-2xl bg-slate-100"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const available = rewards.filter(r => r.unlocked && !r.claimed);
  const claimed = rewards.filter(r => r.claimed);
  const locked = rewards.filter(r => !r.unlocked);

  const typeIcons: Record<string, string> = {
    cosmetic: "✨",
    currency: "💰",
    feature: "🔓",
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-r from-fuchsia-500 via-pink-500 to-rose-500 p-8 text-white shadow-xl">
        <h2 className="text-3xl font-bold">🎁 Rewards Shop</h2>
        <p className="mt-2 text-white/90">
          Level up to unlock exclusive rewards. Claim them when ready!
        </p>
        <div className="mt-4 flex items-center gap-6">
          <div>
            <div className="text-sm opacity-90">Your Level</div>
            <div className="text-3xl font-bold">{userLevel}</div>
          </div>
          <div>
            <div className="text-sm opacity-90">Available</div>
            <div className="text-3xl font-bold">{available.length}</div>
          </div>
          <div>
            <div className="text-sm opacity-90">Claimed</div>
            <div className="text-3xl font-bold">{claimed.length}</div>
          </div>
        </div>
      </div>

      {available.length > 0 && (
        <div className="rounded-3xl bg-white p-6 shadow-lg">
          <h3 className="mb-4 text-xl font-bold text-slate-900">🎉 Ready to Claim</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {available.map(r => (
              <div key={r.id} className="rounded-2xl border-2 border-green-300 bg-green-50 p-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-green-400 to-emerald-500 text-3xl shadow-md">
                    {r.icon}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-slate-900">{r.name}</h4>
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-green-700">
                        {typeIcons[r.type] ?? "🎁"} {r.type}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{r.description}</p>
                    <button
                      onClick={() => handleClaim(r.id)}
                      disabled={claiming === r.id}
                      className="mt-3 w-full rounded-xl bg-green-600 px-4 py-2 font-semibold text-white shadow-md transition-all hover:bg-green-700 disabled:opacity-50"
                    >
                      {claiming === r.id ? "Claiming..." : "Claim Reward"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {claimed.length > 0 && (
        <div className="rounded-3xl bg-white p-6 shadow-lg">
          <h3 className="mb-4 text-xl font-bold text-slate-900">✅ Claimed Rewards</h3>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {claimed.map(r => (
              <div key={r.id} className="flex items-center gap-3 rounded-2xl border-2 border-slate-200 p-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-2xl">
                  {r.icon}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-slate-900">{r.name}</div>
                  <div className="text-xs text-slate-500">Claimed</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {locked.length > 0 && (
        <div className="rounded-3xl bg-white p-6 shadow-lg">
          <h3 className="mb-4 text-xl font-bold text-slate-900">🔒 Locked Rewards</h3>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {locked.map(r => (
              <div key={r.id} className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 opacity-70">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-200 text-2xl">
                  🔒
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-slate-700">{r.name}</div>
                  <div className="text-xs text-slate-500">Unlocks at level {r.levelRequired}</div>
                </div>
                <div className="text-xs font-semibold text-slate-600">Lv {r.levelRequired}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
