export const PROFILE_VISIBILITY_VALUES = ["public", "friends", "private"] as const;
export type ProfileVisibility = (typeof PROFILE_VISIBILITY_VALUES)[number];

export type ProfileUpdateInput = {
  displayName: string;
  bio: string | null;
  location: string | null;
  websiteUrl: string | null;
  profileVisibility: ProfileVisibility;
  showWatchHistory: boolean;
  showXp: boolean;
  showAchievements: boolean;
};

function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNullableTrimmedString(value: unknown, maxLength: number): string | null {
  const text = asTrimmedString(value);
  if (!text) return null;
  return text.slice(0, maxLength);
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeWebsiteUrl(value: unknown): string | null {
  const text = asTrimmedString(value);
  if (!text) return null;

  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString().slice(0, 300);
  } catch {
    return null;
  }
}

export function parseProfileUpdate(body: unknown):
  | { ok: true; data: ProfileUpdateInput }
  | { ok: false; error: string } {
  const input = (body ?? {}) as Record<string, unknown>;
  const displayName = asTrimmedString(input.displayName);

  if (displayName.length < 2) {
    return { ok: false, error: "Display name must be at least 2 characters long." };
  }
  if (displayName.length > 60) {
    return { ok: false, error: "Display name must be 60 characters or fewer." };
  }

  const visibility = asTrimmedString(input.profileVisibility);
  if (!PROFILE_VISIBILITY_VALUES.includes(visibility as ProfileVisibility)) {
    return { ok: false, error: "Invalid profile visibility setting." };
  }

  const websiteUrl = normalizeWebsiteUrl(input.websiteUrl);
  if (asTrimmedString(input.websiteUrl) && !websiteUrl) {
    return { ok: false, error: "Website must be a valid HTTP or HTTPS URL." };
  }

  return {
    ok: true,
    data: {
      displayName,
      bio: asNullableTrimmedString(input.bio, 500),
      location: asNullableTrimmedString(input.location, 120),
      websiteUrl,
      profileVisibility: visibility as ProfileVisibility,
      showWatchHistory: asBoolean(input.showWatchHistory, true),
      showXp: asBoolean(input.showXp, true),
      showAchievements: asBoolean(input.showAchievements, true),
    },
  };
}

export const AVATAR_ALLOWED_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export function validateAvatarFile(file: File):
  | { ok: true; extension: string }
  | { ok: false; error: string } {
  if (file.size <= 0) {
    return { ok: false, error: "Avatar file is empty." };
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return { ok: false, error: "Avatar must be 2 MB or smaller." };
  }

  const extension = AVATAR_ALLOWED_TYPES.get(file.type);
  if (!extension) {
    return { ok: false, error: "Avatar must be a JPEG, PNG, WebP, or GIF image." };
  }

  return { ok: true, extension };
}
