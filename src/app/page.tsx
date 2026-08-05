"use client";

import { useEffect, useState } from "react";
import type { } from "react";
import { ProfileCard } from "@/components/ProfileCard";
import { ActionsPanel } from "@/components/ActionsPanel";
import { BadgesPanel } from "@/components/BadgesPanel";
import { AchievementsPanel } from "@/components/AchievementsPanel";
import { RewardsPanel } from "@/components/RewardsPanel";
import { NotificationsPanel } from "@/components/NotificationsPanel";
import { LeaderboardPanel } from "@/components/LeaderboardPanel";
import { DiscordPanel } from "@/components/DiscordPanel";
import { UpdateBanner } from "@/components/UpdateBanner";
import { useDesktopNavigation } from "@/lib/desktop";

type Tab = "profile" | "achievements" | "badges" | "rewards" | "leaderboard" | "notifications" | "discord";

function DiscordTab({ onLinkChange }: { onLinkChange: () => void }) {
  const [discord, setDiscord] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch("/api/profile")
      .then(r => r.json())
      .then(d => {
        setDiscord(d.discord);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleLinkChange = () => {
    load();
    onLinkChange();
  };

  if (loading || !discord) {
    return (
      <div className="rounded-3xl bg-white p-8 shadow-lg">
        <div className="animate-pulse h-48 rounded-2xl bg-slate-100"></div>
      </div>
    );
  }

  return <DiscordPanel discord={discord} onLinkChange={handleLinkChange} />;
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [refreshKey, setRefreshKey] = useState(0);

  const triggerRefresh = () => setRefreshKey(k => k + 1);

  // Wire up desktop menu/tray navigation — when the user picks a tab from the
  // native menu or system tray, switch to it here. No-op on the web.
  useDesktopNavigation((tab) => {
    if (["profile", "achievements", "badges", "rewards", "leaderboard", "notifications", "discord"].includes(tab)) {
      setActiveTab(tab as Tab);
    }
  });

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "profile", label: "Profile", icon: "👤" },
    { id: "achievements", label: "Achievements", icon: "🏆" },
    { id: "badges", label: "Badges", icon: "🎖️" },
    { id: "rewards", label: "Rewards", icon: "🎁" },
    { id: "leaderboard", label: "Leaderboard", icon: "📊" },
    { id: "notifications", label: "Notifications", icon: "🔔" },
    { id: "discord", label: "Discord", icon: "🎮" },
  ];

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center gap-3">
            <div className="text-5xl">🎬</div>
            <div>
              <h1 className="text-4xl font-bold text-slate-900">you2ube</h1>
              <p className="text-slate-600">Phase 6: Progression System</p>
            </div>
          </div>
        </header>

        {/* Tab Navigation */}
        <nav className="mb-6 flex flex-wrap gap-2 rounded-2xl bg-white p-2 shadow-sm">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-indigo-600 text-white shadow-md"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* Tab Content */}
        <div className="space-y-6">
          {activeTab === "profile" && (
            <>
              <ProfileCard key={`profile-${refreshKey}`} />
              <ActionsPanel onAction={triggerRefresh} />
            </>
          )}
          {activeTab === "achievements" && <AchievementsPanel key={`ach-${refreshKey}`} />}
          {activeTab === "badges" && <BadgesPanel key={`badges-${refreshKey}`} />}
          {activeTab === "rewards" && <RewardsPanel key={`rewards-${refreshKey}`} onClaim={triggerRefresh} />}
          {activeTab === "leaderboard" && <LeaderboardPanel key={`lb-${refreshKey}`} />}
          {activeTab === "notifications" && <NotificationsPanel key={`notif-${refreshKey}`} />}
          {activeTab === "discord" && <DiscordTab onLinkChange={triggerRefresh} />}
        </div>
      </div>

      {/* Desktop-only update banner — renders nothing on the web. */}
      <UpdateBanner />
    </main>
  );
}
