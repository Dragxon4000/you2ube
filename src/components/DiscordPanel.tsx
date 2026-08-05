"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import {
  connectDiscordRpc,
  buildWatchingActivity,
  buildHostingActivity,
  type DiscordRpcClient,
} from "@/lib/discord-rpc";

interface DiscordInfo {
  linked: boolean;
  discordId?: string;
  username?: string;
  discriminator?: string;
  globalName?: string | null;
  avatarUrl?: string;
  linkedAt?: string;
  notifyLevelUps?: boolean;
  notifyAchievements?: boolean;
  notifyBadges?: boolean;
  richPresenceEnabled?: boolean;
}

interface DiscordConfig {
  configured: boolean;
  webhooksEnabled: boolean;
  rpcClientId: string | null;
}

export function DiscordPanel({
  discord,
  onLinkChange,
}: {
  discord: DiscordInfo;
  onLinkChange: () => void;
}) {
  const [config, setConfig] = useState<DiscordConfig | null>(null);
  const [unlinking, setUnlinking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rpcStatus, setRpcStatus] = useState<string>("idle");
  const rpcRef = useRef<DiscordRpcClient | null>(null);

  useEffect(() => {
    fetch("/api/auth/discord/config")
      .then(r => r.json())
      .then(setConfig)
      .catch(() => setConfig({ configured: false, webhooksEnabled: false, rpcClientId: null }));
  }, []);

  // Rich Presence — connect when enabled + linked.
  useEffect(() => {
    if (!config?.rpcClientId) return;
    if (!discord.linked || !discord.richPresenceEnabled) {
      rpcRef.current?.close();
      rpcRef.current = null;
      setRpcStatus("idle");
      return;
    }

    let cancelled = false;
    (async () => {
      setRpcStatus("connecting");
      const client = await connectDiscordRpc(config.rpcClientId!);
      if (cancelled) {
        client?.close();
        return;
      }
      rpcRef.current = client;
      setRpcStatus(client?.status ?? "unavailable");

      // Set an idle "Browsing you2ube" activity as a baseline.
      if (client?.status === "ready") {
        await client.setActivity({
          details: "Browsing you2ube",
          state: "Exploring videos",
          assets: {
            largeImage: "you2ube_logo",
            largeText: "you2ube",
          },
        });
      }
    })();

    return () => {
      cancelled = true;
      rpcRef.current?.close();
      rpcRef.current = null;
    };
  }, [config, discord.linked, discord.richPresenceEnabled]);

  if (!config) {
    return (
      <div className="rounded-3xl bg-white p-8 shadow-lg">
        <div className="animate-pulse h-32 rounded-2xl bg-slate-100"></div>
      </div>
    );
  }

  if (!config.configured) {
    return (
      <div className="rounded-3xl bg-white p-8 shadow-lg text-center">
        <div className="text-5xl mb-4">🔌</div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Discord Integration</h2>
        <p className="text-slate-600 max-w-md mx-auto">
          Discord features are not configured on this instance. To enable them, set
          <code className="mx-1 rounded bg-slate-100 px-2 py-0.5 text-sm">DISCORD_CLIENT_ID</code>
          and
          <code className="mx-1 rounded bg-slate-100 px-2 py-0.5 text-sm">DISCORD_CLIENT_SECRET</code>
          environment variables.
        </p>
      </div>
    );
  }

  const handleUnlink = async () => {
    if (!confirm("Disconnect your Discord account? Your you2ube progress is preserved.")) return;
    setUnlinking(true);
    try {
      const res = await fetch("/api/auth/discord/unlink", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        onLinkChange();
      } else {
        alert(data.error ?? "Failed to unlink");
      }
    } finally {
      setUnlinking(false);
    }
  };

  const handleToggle = async (key: keyof DiscordInfo, value: boolean) => {
    setSaving(true);
    try {
      const res = await fetch("/api/auth/discord/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      const data = await res.json();
      if (data.success) {
        onLinkChange();
      } else {
        alert(data.error ?? "Failed to save");
      }
    } finally {
      setSaving(false);
    }
  };

  if (!discord.linked) {
    return (
      <div className="rounded-3xl bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-8 text-white shadow-xl">
        <div className="flex items-center gap-4 mb-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 text-4xl backdrop-blur">
            🎮
          </div>
          <div>
            <h2 className="text-2xl font-bold">Connect Discord</h2>
            <p className="text-white/80">Link your Discord to unlock social features.</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 mb-6">
          <FeatureCard icon="🆔" title="Identity" desc="Show your Discord avatar & name on your profile." />
          <FeatureCard icon="🔔" title="Bot notifications" desc="Get pinged in Discord on level-ups & achievements." enabled={config.webhooksEnabled} />
          <FeatureCard icon="🎯" title="Rich Presence" desc="Show what you're watching in your Discord status." />
        </div>

        <a
          href="/api/auth/discord"
          className="inline-block rounded-xl bg-white px-6 py-3 font-semibold text-indigo-600 shadow-md transition-all hover:bg-indigo-50"
        >
          Connect with Discord →
        </a>
        <p className="mt-3 text-xs text-white/70">
          Only requests your Discord identity (username, avatar). We never access DMs, friends, or private messages.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Linked identity card */}
      <div className="rounded-3xl bg-white p-8 shadow-lg">
        <div className="flex items-start gap-4">
          <Image
            src={discord.avatarUrl ?? ""}
            alt={discord.username ?? "Discord avatar"}
            width={80}
            height={80}
            className="rounded-full ring-4 ring-indigo-100"
            unoptimized // Discord CDN already serves optimized avatars via ?size=
          />
          <div className="flex-1">
            <div className="text-sm text-slate-500">Connected as</div>
            <div className="text-2xl font-bold text-slate-900">
              {discord.globalName ?? discord.username}
            </div>
            <div className="text-sm text-slate-600">
              @{discord.username}
              {discord.discriminator && discord.discriminator !== "0" && `#${discord.discriminator}`}
            </div>
            <div className="mt-2 text-xs text-slate-400">
              Linked {new Date(discord.linkedAt!).toLocaleDateString()}
            </div>
          </div>
          <button
            onClick={handleUnlink}
            disabled={unlinking}
            className="rounded-xl border-2 border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition-all hover:bg-red-50 disabled:opacity-50"
          >
            {unlinking ? "Disconnecting..." : "Disconnect"}
          </button>
        </div>
      </div>

      {/* Notification preferences */}
      {config.webhooksEnabled && (
        <div className="rounded-3xl bg-white p-8 shadow-lg">
          <h3 className="text-xl font-bold text-slate-900 mb-1">🔔 Bot Notifications</h3>
          <p className="text-sm text-slate-600 mb-5">
            Our Discord bot can post updates to a configured channel when you hit milestones.
          </p>
          <div className="space-y-3">
            <Toggle
              label="Level-ups"
              description="Notify the channel when you reach a new level."
              checked={discord.notifyLevelUps ?? false}
              onChange={(v) => handleToggle("notifyLevelUps", v)}
              disabled={saving}
            />
            <Toggle
              label="Achievements"
              description="Notify the channel when you unlock an achievement."
              checked={discord.notifyAchievements ?? false}
              onChange={(v) => handleToggle("notifyAchievements", v)}
              disabled={saving}
            />
            <Toggle
              label="Badges"
              description="Notify the channel when you earn a badge."
              checked={discord.notifyBadges ?? false}
              onChange={(v) => handleToggle("notifyBadges", v)}
              disabled={saving}
            />
          </div>
        </div>
      )}

      {/* Rich Presence */}
      <div className="rounded-3xl bg-white p-8 shadow-lg">
        <h3 className="text-xl font-bold text-slate-900 mb-1">🎯 Rich Presence</h3>
        <p className="text-sm text-slate-600 mb-5">
          Show what you&apos;re watching on you2ube as your Discord status. Requires the Discord desktop app to be running.
        </p>
        <Toggle
          label="Enable Rich Presence"
          description={
            rpcStatus === "ready"
              ? "✅ Connected to Discord desktop — activity is being set."
              : rpcStatus === "connecting"
              ? "⏳ Connecting to Discord desktop..."
              : rpcStatus === "authorizing"
              ? "🔐 Authorizing with Discord (check your Discord app for a prompt)..."
              : "⚠️ Discord desktop not detected. Enable this and open Discord desktop to activate."
          }
          checked={discord.richPresenceEnabled ?? false}
          onChange={(v) => handleToggle("richPresenceEnabled", v)}
          disabled={saving}
        />
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, desc, enabled = true }: { icon: string; title: string; desc: string; enabled?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 ${enabled ? "bg-white/10" : "bg-white/5 opacity-60"}`}>
      <div className="text-2xl mb-1">{icon}</div>
      <div className="font-semibold text-sm">{title}</div>
      <div className="text-xs text-white/80 mt-1">{desc}</div>
      {!enabled && <div className="text-[10px] mt-1 uppercase tracking-wide text-white/60">Not configured</div>}
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer rounded-xl p-3 transition hover:bg-slate-50">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
      />
      <div className="flex-1">
        <div className="font-semibold text-slate-900">{label}</div>
        <div className="text-sm text-slate-600">{description}</div>
      </div>
    </label>
  );
}

// Export the Rich Presence helpers so other components can update activity.
export { buildWatchingActivity, buildHostingActivity };
export type { DiscordRpcClient };
