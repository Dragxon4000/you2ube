import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { getSessionUser } from "@/lib/auth/session";
import { displayNameFromEmail } from "@/lib/auth/validation";
import { ProfileForm } from "@/components/profile-form";
import { LogoutButton } from "@/components/logout-button";

export const dynamic = "force-dynamic";

async function getOrCreateProfile(userId: string, email: string) {
  const existing = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  if (existing[0]) return existing[0];

  const [profile] = await db
    .insert(profiles)
    .values({
      userId,
      displayName: displayNameFromEmail(email),
    })
    .returning();

  return profile;
}

export default async function ProfilePage() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 px-6 py-12">
        <div className="text-center">
          <p className="text-slate-400">You need to log in to edit your profile.</p>
          <Link href="/login" className="mt-4 inline-block text-sm font-semibold text-red-400 hover:underline">
            Log in
          </Link>
        </div>
      </main>
    );
  }

  const profile = await getOrCreateProfile(user.id, user.email);

  return (
    <main className="min-h-screen bg-slate-950">
      <nav className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <Link href="/dashboard" className="flex items-center gap-1.5">
          <svg className="h-7 w-7 text-red-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" />
            <path d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="white" />
          </svg>
          <span className="text-lg font-bold text-white">you2ube</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm font-medium text-slate-400 hover:text-white">
            Dashboard
          </Link>
          <LogoutButton />
        </div>
      </nav>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.08em] text-slate-500">Settings</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Edit profile</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Manage how you appear on you2ube, upload an avatar through Supabase Storage, and control what social data is public.
          </p>
        </div>

        <ProfileForm
          profile={{
            displayName: profile.displayName,
            bio: profile.bio,
            location: profile.location,
            websiteUrl: profile.websiteUrl,
            avatarUrl: profile.avatarUrl,
            profileVisibility: profile.profileVisibility,
            showWatchHistory: profile.showWatchHistory,
            showXp: profile.showXp,
            showAchievements: profile.showAchievements,
          }}
        />
      </div>
    </main>
  );
}
