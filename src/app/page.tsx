"use client";

import { useEffect, useState } from "react";
import { ProfileCard } from "@/components/ProfileCard";
import { ActionsPanel } from "@/components/ActionsPanel";
import { BadgesPanel } from "@/components/BadgesPanel";
import { AchievementsPanel } from "@/components/AchievementsPanel";
import { RewardsPanel } from "@/components/RewardsPanel";
import { NotificationsPanel } from "@/components/NotificationsPanel";
import { LeaderboardPanel } from "@/components/LeaderboardPanel";
import { DiscordPanel } from "@/components/DiscordPanel";
import { UpdateBanner } from "@/components/UpdateBanner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
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
    <ErrorBoundary>
    <main id="main-content" className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Skip-to-content link for keyboard/screen-reader users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-indigo-600 focus:px-4 focus:py-2 focus:text-white focus:shadow-lg"
      >
        Skip to main content
      </a>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center gap-3">
            <div className="text-5xl" aria-hidden="true">🎬</div>
            <div>
              <h1 className="text-4xl font-bold text-slate-900">you2ube</h1>
              <p className="text-slate-600">Progression system with XP, achievements, badges, and rewards.</p>
            </div>
          </div>
        </header>

        {/* Tab Navigation — ARIA tablist pattern */}
        <nav
          aria-label="Main sections"
          className="mb-6 flex flex-wrap gap-2 rounded-2xl bg-white p-2 shadow-sm"
        >
          <div role="tablist" aria-label="Dashboard sections" className="flex flex-wrap gap-2">
            {tabs.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  id={`tab-${tab.id}`}
                  aria-selected={isActive}
                  aria-controls={`panel-${tab.id}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => setActiveTab(tab.id)}
                  onKeyDown={(e) => {
                    // Arrow key navigation between tabs.
                    const idx = tabs.findIndex(t => t.id === tab.id);
                    let next: number | null = null;
                    if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
                    else if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
                    else if (e.key === "Home") next = 0;
                    else if (e.key === "End") next = tabs.length - 1;
                    if (next !== null) {
                      e.preventDefault();
                      setActiveTab(tabs[next].id);
                      document.getElementById(`tab-${tabs[next].id}`)?.focus();
                    }
                  }}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                    isActive
                      ? "bg-indigo-600 text-white shadow-md"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span aria-hidden="true">{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Tab Panels — ARIA tabpanel pattern */}
        <div className="space-y-6">
          <div
            role="tabpanel"
            id="panel-profile"
            aria-labelledby="tab-profile"
            hidden={activeTab !== "profile"}
            tabIndex={0}
          >
            {activeTab === "profile" && (
              <>
                <ProfileCard key={`profile-${refreshKey}`} />
                <ActionsPanel onAction={triggerRefresh} />
              </>
            )}
          </div>
          <div
            role="tabpanel"
            id="panel-achievements"
            aria-labelledby="tab-achievements"
            hidden={activeTab !== "achievements"}
            tabIndex={0}
          >
            {activeTab === "achievements" && <AchievementsPanel key={`ach-${refreshKey}`} />}
          </div>
          <div
            role="tabpanel"
            id="panel-badges"
            aria-labelledby="tab-badges"
            hidden={activeTab !== "badges"}
            tabIndex={0}
          >
            {activeTab === "badges" && <BadgesPanel key={`badges-${refreshKey}`} />}
          </div>
          <div
            role="tabpanel"
            id="panel-rewards"
            aria-labelledby="tab-rewards"
            hidden={activeTab !== "rewards"}
            tabIndex={0}
          >
            {activeTab === "rewards" && <RewardsPanel key={`rewards-${refreshKey}`} onClaim={triggerRefresh} />}
          </div>
          <div
            role="tabpanel"
            id="panel-leaderboard"
            aria-labelledby="tab-leaderboard"
            hidden={activeTab !== "leaderboard"}
            tabIndex={0}
          >
            {activeTab === "leaderboard" && <LeaderboardPanel key={`lb-${refreshKey}`} />}
          </div>
          <div
            role="tabpanel"
            id="panel-notifications"
            aria-labelledby="tab-notifications"
            hidden={activeTab !== "notifications"}
            tabIndex={0}
          >
            {activeTab === "notifications" && <NotificationsPanel key={`notif-${refreshKey}`} />}
          </div>
          <div
            role="tabpanel"
            id="panel-discord"
            aria-labelledby="tab-discord"
            hidden={activeTab !== "discord"}
            tabIndex={0}
          >
            {activeTab === "discord" && <DiscordTab onLinkChange={triggerRefresh} />}
          </div>
        </div>
      </div>

      {/* Desktop-only update banner — renders nothing on the web. */}
      <UpdateBanner />
    </main>
    </ErrorBoundary>
  );
}
