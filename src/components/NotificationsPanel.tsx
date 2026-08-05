"use client";

import { useEffect, useState } from "react";

interface Notification {
  id: number;
  userId: number;
  type: string;
  title: string;
  message: string;
  icon: string;
  metadata: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

const typeColors: Record<string, string> = {
  level_up: "from-indigo-500 to-purple-600",
  achievement: "from-amber-400 to-orange-500",
  badge: "from-pink-500 to-rose-600",
  reward: "from-emerald-500 to-teal-600",
  reward_available: "from-fuchsia-500 to-pink-600",
  xp: "from-blue-500 to-cyan-600",
  system: "from-slate-500 to-slate-700",
};

export function NotificationsPanel() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = (signal?: AbortSignal) => {
    return fetch("/api/notifications", signal ? { signal } : {})
      .then(r => r.json())
      .then(d => {
        if (!signal?.aborted) {
          setNotifications(d.notifications);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError" && !signal?.aborted) {
          // Surface a non-fatal "failed to load" state instead of hanging forever.
          setLoading(false);
        }
      });
  };

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, []);

  const handleMarkAll = async () => {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true }),
    });
    load();
  };

  const handleMarkOne = async (id: number) => {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  };

  if (loading) {
    return (
      <div className="rounded-3xl bg-white p-8 shadow-lg">
        <div className="animate-pulse space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-slate-100"></div>
          ))}
        </div>
      </div>
    );
  }

  const unread = notifications.filter(n => !n.read).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-3xl bg-gradient-to-r from-blue-500 to-cyan-600 p-8 text-white shadow-xl">
        <div>
          <h2 className="text-3xl font-bold">🔔 Notifications</h2>
          <p className="mt-2 text-white/90">
            {unread === 0 ? "You&apos;re all caught up!" : `${unread} unread notification${unread === 1 ? "" : "s"}`}
          </p>
        </div>
        {unread > 0 && (
          <button
            onClick={handleMarkAll}
            className="rounded-xl bg-white px-5 py-3 font-semibold text-blue-600 shadow-md transition-all hover:bg-blue-50"
          >
            Mark all as read
          </button>
        )}
      </div>

      <div className="space-y-3">
        {notifications.length === 0 ? (
          <div className="rounded-3xl bg-white p-12 text-center shadow-lg">
            <div className="text-5xl">📭</div>
            <p className="mt-3 text-slate-600">No notifications yet. Start earning XP to see them here!</p>
          </div>
        ) : (
          notifications.map(n => (
            <div
              key={n.id}
              onClick={() => !n.read && handleMarkOne(n.id)}
              className={`flex cursor-pointer items-start gap-4 rounded-2xl p-5 shadow-lg transition-all ${
                n.read ? "bg-white opacity-70" : "bg-white ring-2 ring-indigo-200 hover:shadow-xl"
              }`}
            >
              <div
                className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${typeColors[n.type] ?? typeColors.system} text-2xl shadow-md`}
              >
                {n.icon}
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-bold text-slate-900">
                    {n.title}
                    {!n.read && <span className="ml-2 inline-block h-2 w-2 rounded-full bg-indigo-500"></span>}
                  </h4>
                  <span className="flex-shrink-0 text-xs text-slate-400">
                    {new Date(n.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{n.message}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
