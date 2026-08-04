"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";

type ProfileVisibility = "public" | "friends" | "private";

type EditableProfile = {
  displayName: string;
  bio: string | null;
  location: string | null;
  websiteUrl: string | null;
  avatarUrl: string | null;
  profileVisibility: ProfileVisibility;
  showWatchHistory: boolean;
  showXp: boolean;
  showAchievements: boolean;
};

export function ProfileForm({ profile }: { profile: EditableProfile }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [location, setLocation] = useState(profile.location ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(profile.websiteUrl ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);
  const [profileVisibility, setProfileVisibility] = useState<ProfileVisibility>(
    profile.profileVisibility,
  );
  const [showWatchHistory, setShowWatchHistory] = useState(profile.showWatchHistory);
  const [showXp, setShowXp] = useState(profile.showXp);
  const [showAchievements, setShowAchievements] = useState(profile.showAchievements);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          bio,
          location,
          websiteUrl,
          profileVisibility,
          showWatchHistory,
          showXp,
          showAchievements,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Unable to save profile.");
        return;
      }
      setMessage("Profile updated.");
      router.refresh();
    } catch {
      setError("Something went wrong while saving your profile.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage(null);
    setError(null);

    const formData = new FormData();
    formData.set("avatar", file);

    try {
      const response = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Unable to upload avatar.");
        return;
      }
      setAvatarUrl(data.avatarUrl ?? null);
      setMessage("Avatar uploaded.");
      router.refresh();
    } catch {
      setError("Something went wrong while uploading your avatar.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemoveAvatar() {
    setUploading(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/profile/avatar", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Unable to remove avatar.");
        return;
      }
      setAvatarUrl(null);
      setMessage("Avatar removed.");
      router.refresh();
    } catch {
      setError("Something went wrong while removing your avatar.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-lg font-semibold text-white">Avatar</h2>
        <div className="mt-5 flex flex-col items-center gap-4">
          <div className="grid h-32 w-32 place-items-center overflow-hidden rounded-full border border-slate-700 bg-slate-800 text-4xl font-bold text-slate-500">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="Profile avatar" className="h-full w-full object-cover" />
            ) : (
              displayName.slice(0, 1).toUpperCase() || "?"
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleAvatarChange}
            className="hidden"
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-60"
          >
            {uploading ? "Uploading…" : "Upload avatar"}
          </button>
          {avatarUrl && (
            <button
              type="button"
              disabled={uploading}
              onClick={handleRemoveAvatar}
              className="w-full rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 disabled:opacity-60"
            >
              Remove avatar
            </button>
          )}
          <p className="text-center text-xs text-slate-500">
            JPEG, PNG, WebP, or GIF. Max 2 MB. Stored in Supabase Storage.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-lg font-semibold text-white">Profile details</h2>
        <div className="mt-5 grid gap-5">
          <label className="block">
            <span className="text-sm font-medium text-slate-300">Display name</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              minLength={2}
              maxLength={60}
              required
              className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-300">Bio</span>
            <textarea
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              maxLength={500}
              rows={4}
              placeholder="Tell people what you like to watch..."
              className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
            />
            <span className="mt-1 block text-xs text-slate-500">{bio.length}/500</span>
          </label>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-300">Location</span>
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                maxLength={120}
                placeholder="City, country"
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-300">Website</span>
              <input
                value={websiteUrl}
                onChange={(event) => setWebsiteUrl(event.target.value)}
                maxLength={300}
                placeholder="https://example.com"
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
              />
            </label>
          </div>
        </div>

        <div className="mt-8 border-t border-slate-800 pt-6">
          <h2 className="text-lg font-semibold text-white">Privacy settings</h2>
          <div className="mt-5 grid gap-5">
            <label className="block">
              <span className="text-sm font-medium text-slate-300">Profile visibility</span>
              <select
                value={profileVisibility}
                onChange={(event) => setProfileVisibility(event.target.value as ProfileVisibility)}
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-white outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
              >
                <option value="public">Public</option>
                <option value="friends">Friends only (reserved)</option>
                <option value="private">Private</option>
              </select>
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <input
                type="checkbox"
                checked={showWatchHistory}
                onChange={(event) => setShowWatchHistory(event.target.checked)}
                className="mt-1 h-4 w-4 accent-red-600"
              />
              <span>
                <span className="block text-sm font-medium text-slate-200">Show watch history</span>
                <span className="block text-xs text-slate-500">Allows public profile visitors to see recent watched videos when your profile is public.</span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <input
                type="checkbox"
                checked={showXp}
                onChange={(event) => setShowXp(event.target.checked)}
                className="mt-1 h-4 w-4 accent-red-600"
              />
              <span>
                <span className="block text-sm font-medium text-slate-200">Show XP and level</span>
                <span className="block text-xs text-slate-500">Controls whether your XP stats appear on public profile pages.</span>
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <input
                type="checkbox"
                checked={showAchievements}
                onChange={(event) => setShowAchievements(event.target.checked)}
                className="mt-1 h-4 w-4 accent-red-600"
              />
              <span>
                <span className="block text-sm font-medium text-slate-200">Show achievements</span>
                <span className="block text-xs text-slate-500">Reserved for the achievement UI phase.</span>
              </span>
            </label>
          </div>
        </div>

        {error && (
          <p className="mt-5 rounded-lg border border-red-800 bg-red-900/50 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
        {message && (
          <p className="mt-5 rounded-lg border border-emerald-800 bg-emerald-900/50 px-3 py-2 text-sm text-emerald-300">
            {message}
          </p>
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-red-600 px-6 py-2.5 font-semibold text-white transition hover:bg-red-500 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save profile"}
          </button>
        </div>
      </section>
    </form>
  );
}
