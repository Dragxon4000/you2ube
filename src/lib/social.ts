import "server-only";

import { and, desc, eq, gt, inArray, ne, or } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  friendRequests,
  friendships,
  presence,
  profiles,
  users,
  type FriendRequestStatus,
} from "@/db/schema";
import { broadcastSocialUpdate } from "@/lib/supabase/realtime";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export type ActivityType =
  | "watch_start"
  | "watch_complete"
  | "level_up"
  | "achievement_unlock"
  | "friend_added";

export type UserSummary = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
};

export type FriendRequestRecord = {
  id: string;
  senderId: string;
  receiverId: string;
  status: FriendRequestStatus;
  message: string | null;
  createdAt: Date;
  sender: UserSummary;
  receiver: UserSummary | null;
};

export type FriendshipRecord = {
  id: string;
  userA: string;
  userB: string;
  createdAt: Date;
  friend: UserSummary;
  presence: {
    status: "online" | "away" | "offline";
    lastSeen: Date;
    currentVideoId: string | null;
    currentVideoTitle: string | null;
    customStatus: string | null;
  };
};

export type ActivityRecord = {
  id: string;
  userId: string;
  type: ActivityType;
  metadata: Record<string, unknown> | null;
  visibility: "public" | "friends" | "private";
  createdAt: Date;
  user: UserSummary;
};

function mapUser(row: {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}): UserSummary {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName ?? row.email,
    avatarUrl: row.avatarUrl,
  };
}

function canonicalPair(first: string, second: string): [string, string] {
  return first < second ? [first, second] : [second, first];
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}

async function getFriendIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ userA: friendships.userA, userB: friendships.userB })
    .from(friendships)
    .where(or(eq(friendships.userA, userId), eq(friendships.userB, userId)));

  return rows.map((row) => (row.userA === userId ? row.userB : row.userA));
}

async function broadcastToFriends(userId: string, event: "friend_request_changed" | "friendship_changed" | "presence_changed" | "activity_changed") {
  const friendIds = await getFriendIds(userId);
  await broadcastSocialUpdate([userId, ...friendIds], event);
}

// ---------------------------------------------------------------------------
// Friend requests
// ---------------------------------------------------------------------------

export async function getFriendRequestsForUser(userId: string) {
  const incomingRows = await db
    .select({
      id: friendRequests.id,
      senderId: friendRequests.senderId,
      receiverId: friendRequests.receiverId,
      status: friendRequests.status,
      message: friendRequests.message,
      createdAt: friendRequests.createdAt,
      senderDbId: users.id,
      senderEmail: users.email,
      senderDisplayName: profiles.displayName,
      senderAvatarUrl: profiles.avatarUrl,
    })
    .from(friendRequests)
    .innerJoin(users, eq(users.id, friendRequests.senderId))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(and(eq(friendRequests.receiverId, userId), eq(friendRequests.status, "pending")))
    .orderBy(desc(friendRequests.createdAt));

  const outgoingRows = await db
    .select({
      id: friendRequests.id,
      senderId: friendRequests.senderId,
      receiverId: friendRequests.receiverId,
      status: friendRequests.status,
      message: friendRequests.message,
      createdAt: friendRequests.createdAt,
      receiverDbId: users.id,
      receiverEmail: users.email,
      receiverDisplayName: profiles.displayName,
      receiverAvatarUrl: profiles.avatarUrl,
    })
    .from(friendRequests)
    .innerJoin(users, eq(users.id, friendRequests.receiverId))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(and(eq(friendRequests.senderId, userId), eq(friendRequests.status, "pending")))
    .orderBy(desc(friendRequests.createdAt));

  const incoming: FriendRequestRecord[] = incomingRows.map((row) => ({
    id: row.id,
    senderId: row.senderId,
    receiverId: row.receiverId,
    status: row.status as FriendRequestStatus,
    message: row.message,
    createdAt: row.createdAt,
    sender: mapUser({
      id: row.senderDbId,
      email: row.senderEmail,
      displayName: row.senderDisplayName,
      avatarUrl: row.senderAvatarUrl,
    }),
    receiver: null,
  }));

  const outgoing: FriendRequestRecord[] = outgoingRows.map((row) => ({
    id: row.id,
    senderId: row.senderId,
    receiverId: row.receiverId,
    status: row.status as FriendRequestStatus,
    message: row.message,
    createdAt: row.createdAt,
    sender: mapUser({ id: userId, email: "", displayName: "You", avatarUrl: null }),
    receiver: mapUser({
      id: row.receiverDbId,
      email: row.receiverEmail,
      displayName: row.receiverDisplayName,
      avatarUrl: row.receiverAvatarUrl,
    }),
  }));

  return { incoming, outgoing };
}

export async function sendFriendRequest({
  senderId,
  receiverId,
  message,
}: {
  senderId: string;
  receiverId: string;
  message?: string;
}) {
  if (!isValidUuid(receiverId)) {
    return { ok: false as const, error: "Invalid user ID.", status: 400 };
  }
  if (senderId === receiverId) {
    return { ok: false as const, error: "You cannot add yourself as a friend.", status: 400 };
  }

  const [receiver] = await db.select({ id: users.id }).from(users).where(eq(users.id, receiverId)).limit(1);
  if (!receiver) return { ok: false as const, error: "User not found.", status: 404 };

  const [userA, userB] = canonicalPair(senderId, receiverId);
  const [alreadyFriends] = await db
    .select({ id: friendships.id })
    .from(friendships)
    .where(and(eq(friendships.userA, userA), eq(friendships.userB, userB)))
    .limit(1);
  if (alreadyFriends) {
    return { ok: false as const, error: "You are already friends with that user.", status: 409 };
  }

  const [reciprocal] = await db
    .select({ id: friendRequests.id })
    .from(friendRequests)
    .where(
      and(
        eq(friendRequests.senderId, receiverId),
        eq(friendRequests.receiverId, senderId),
        eq(friendRequests.status, "pending"),
      ),
    )
    .limit(1);
  if (reciprocal) {
    return acceptFriendRequest({ requestId: reciprocal.id, receiverId: senderId });
  }

  const [existing] = await db
    .select()
    .from(friendRequests)
    .where(and(eq(friendRequests.senderId, senderId), eq(friendRequests.receiverId, receiverId)))
    .orderBy(desc(friendRequests.createdAt))
    .limit(1);

  try {
    if (existing) {
      if (existing.status === "pending") {
        return { ok: false as const, error: "A friend request is already pending.", status: 409 };
      }
      const [reopened] = await db
        .update(friendRequests)
        .set({ status: "pending", message: message?.trim().slice(0, 200) || null, updatedAt: new Date() })
        .where(eq(friendRequests.id, existing.id))
        .returning({ id: friendRequests.id });
      await broadcastSocialUpdate([senderId, receiverId], "friend_request_changed");
      return { ok: true as const, requestId: reopened.id };
    }

    const [created] = await db
      .insert(friendRequests)
      .values({
        senderId,
        receiverId,
        message: message?.trim().slice(0, 200) || null,
        status: "pending",
      })
      .returning({ id: friendRequests.id });

    await broadcastSocialUpdate([senderId, receiverId], "friend_request_changed");
    return { ok: true as const, requestId: created.id };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false as const, error: "A friend request is already pending.", status: 409 };
    }
    throw error;
  }
}

export async function acceptFriendRequest({ requestId, receiverId }: { requestId: string; receiverId: string }) {
  if (!isValidUuid(requestId)) return { ok: false as const, error: "Invalid request ID.", status: 400 };

  const [request] = await db
    .select()
    .from(friendRequests)
    .where(and(eq(friendRequests.id, requestId), eq(friendRequests.receiverId, receiverId)))
    .limit(1);
  if (!request || request.status !== "pending") {
    return { ok: false as const, error: "Friend request not found or already handled.", status: 404 };
  }

  const [userA, userB] = canonicalPair(request.senderId, request.receiverId);
  await db.transaction(async (tx) => {
    await tx.update(friendRequests).set({ status: "accepted", updatedAt: new Date() }).where(eq(friendRequests.id, requestId));
    await tx.insert(friendships).values({ userA, userB }).onConflictDoNothing();
    await tx.insert(activities).values([
      { userId: request.senderId, type: "friend_added", metadata: { friendId: request.receiverId }, visibility: "friends" },
      { userId: request.receiverId, type: "friend_added", metadata: { friendId: request.senderId }, visibility: "friends" },
    ]);
  });

  await broadcastSocialUpdate([request.senderId, request.receiverId], "friendship_changed");
  await broadcastSocialUpdate([request.senderId, request.receiverId], "activity_changed");
  return { ok: true as const };
}

export async function rejectFriendRequest({ requestId, receiverId }: { requestId: string; receiverId: string }) {
  if (!isValidUuid(requestId)) return { ok: false as const, error: "Invalid request ID.", status: 400 };
  const [request] = await db
    .select({ id: friendRequests.id, senderId: friendRequests.senderId })
    .from(friendRequests)
    .where(and(eq(friendRequests.id, requestId), eq(friendRequests.receiverId, receiverId), eq(friendRequests.status, "pending")))
    .limit(1);
  if (!request) return { ok: false as const, error: "Request not found.", status: 404 };

  await db.update(friendRequests).set({ status: "rejected", updatedAt: new Date() }).where(eq(friendRequests.id, requestId));
  await broadcastSocialUpdate([request.senderId, receiverId], "friend_request_changed");
  return { ok: true as const };
}

export async function cancelFriendRequest({ requestId, senderId }: { requestId: string; senderId: string }) {
  if (!isValidUuid(requestId)) return { ok: false as const, error: "Invalid request ID.", status: 400 };
  const [request] = await db
    .select({ id: friendRequests.id, receiverId: friendRequests.receiverId })
    .from(friendRequests)
    .where(and(eq(friendRequests.id, requestId), eq(friendRequests.senderId, senderId), eq(friendRequests.status, "pending")))
    .limit(1);
  if (!request) return { ok: false as const, error: "Request not found.", status: 404 };

  await db.update(friendRequests).set({ status: "cancelled", updatedAt: new Date() }).where(eq(friendRequests.id, requestId));
  await broadcastSocialUpdate([senderId, request.receiverId], "friend_request_changed");
  return { ok: true as const };
}

export async function removeFriend({ userId, friendId }: { userId: string; friendId: string }) {
  if (!isValidUuid(friendId)) return { ok: false as const, error: "Invalid friend ID.", status: 400 };
  const [userA, userB] = canonicalPair(userId, friendId);
  await db.delete(friendships).where(and(eq(friendships.userA, userA), eq(friendships.userB, userB)));
  await broadcastSocialUpdate([userId, friendId], "friendship_changed");
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// Friends and presence
// ---------------------------------------------------------------------------

export async function getFriendsForUser(userId: string): Promise<FriendshipRecord[]> {
  const edges = await db
    .select()
    .from(friendships)
    .where(or(eq(friendships.userA, userId), eq(friendships.userB, userId)))
    .orderBy(desc(friendships.createdAt));
  if (edges.length === 0) return [];

  const friendIds = edges.map((edge) => (edge.userA === userId ? edge.userB : edge.userA));
  const userRows = await db
    .select({ id: users.id, email: users.email, displayName: profiles.displayName, avatarUrl: profiles.avatarUrl })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(inArray(users.id, friendIds));
  const userMap = new Map(userRows.map((row) => [row.id, mapUser(row)]));
  const presenceRows = await db.select().from(presence).where(inArray(presence.userId, friendIds));
  const presenceMap = new Map(presenceRows.map((row) => [row.userId, row]));

  return edges.map((edge) => {
    const friendId = edge.userA === userId ? edge.userB : edge.userA;
    const friendPresence = presenceMap.get(friendId);
    return {
      id: edge.id,
      userA: edge.userA,
      userB: edge.userB,
      createdAt: edge.createdAt,
      friend: userMap.get(friendId) ?? { id: friendId, email: "", displayName: "Unknown", avatarUrl: null },
      presence: {
        status: (friendPresence?.status ?? "offline") as "online" | "away" | "offline",
        lastSeen: friendPresence?.lastSeen ?? edge.createdAt,
        currentVideoId: friendPresence?.currentVideoId ?? null,
        currentVideoTitle: friendPresence?.currentVideoTitle ?? null,
        customStatus: friendPresence?.customStatus ?? null,
      },
    };
  });
}

export async function setUserPresence({
  userId,
  status,
  currentVideoId,
  currentVideoTitle,
  customStatus,
}: {
  userId: string;
  status: "online" | "away" | "offline";
  currentVideoId?: string | null;
  currentVideoTitle?: string | null;
  customStatus?: string | null;
}) {
  const now = new Date();
  await db
    .insert(presence)
    .values({
      userId,
      status,
      lastSeen: now,
      currentVideoId: currentVideoId ?? null,
      currentVideoTitle: currentVideoTitle?.slice(0, 300) ?? null,
      customStatus: customStatus?.slice(0, 120) ?? null,
    })
    .onConflictDoUpdate({
      target: presence.userId,
      set: {
        status,
        lastSeen: now,
        currentVideoId: currentVideoId ?? null,
        currentVideoTitle: currentVideoTitle?.slice(0, 300) ?? null,
        customStatus: customStatus?.slice(0, 120) ?? null,
      },
    });

  await broadcastToFriends(userId, "presence_changed");
}

export async function heartbeatPresence(userId: string) {
  await db.update(presence).set({ lastSeen: new Date() }).where(eq(presence.userId, userId));
  await broadcastToFriends(userId, "presence_changed");
}

export async function getOnlineUsers(sinceMinutes = 5) {
  const cutoff = new Date(Date.now() - sinceMinutes * 60 * 1000);
  return db
    .select({
      userId: presence.userId,
      status: presence.status,
      lastSeen: presence.lastSeen,
      currentVideoId: presence.currentVideoId,
      currentVideoTitle: presence.currentVideoTitle,
      customStatus: presence.customStatus,
      displayName: profiles.displayName,
      avatarUrl: profiles.avatarUrl,
    })
    .from(presence)
    .leftJoin(profiles, eq(profiles.userId, presence.userId))
    .where(and(gt(presence.lastSeen, cutoff), ne(presence.status, "offline")));
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

export async function createActivity(
  userId: string,
  type: ActivityType,
  metadata: Record<string, unknown>,
  visibility: "public" | "friends" | "private" = "friends",
) {
  const [activity] = await db
    .insert(activities)
    .values({ userId, type, metadata, visibility })
    .returning({ id: activities.id });

  await broadcastToFriends(userId, "activity_changed");
  return activity;
}

async function mapActivityRows(rows: Array<{
  id: string;
  userId: string;
  type: string;
  metadata: Record<string, unknown> | null;
  visibility: string;
  createdAt: Date;
  actorId: string;
  actorEmail: string;
  actorDisplayName: string | null;
  actorAvatarUrl: string | null;
}>): Promise<ActivityRecord[]> {
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    type: row.type as ActivityType,
    metadata: row.metadata,
    visibility: row.visibility as "public" | "friends" | "private",
    createdAt: row.createdAt,
    user: mapUser({ id: row.actorId, email: row.actorEmail, displayName: row.actorDisplayName, avatarUrl: row.actorAvatarUrl }),
  }));
}

export async function getActivityFeedForUser(userId: string, limit = 30) {
  const friendIds = await getFriendIds(userId);
  const visibleIds = [userId, ...friendIds];
  const rows = await db
    .select({
      id: activities.id,
      userId: activities.userId,
      type: activities.type,
      metadata: activities.metadata,
      visibility: activities.visibility,
      createdAt: activities.createdAt,
      actorId: users.id,
      actorEmail: users.email,
      actorDisplayName: profiles.displayName,
      actorAvatarUrl: profiles.avatarUrl,
    })
    .from(activities)
    .innerJoin(users, eq(users.id, activities.userId))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(
      and(
        inArray(activities.userId, visibleIds),
        ne(activities.visibility, "private"),
        or(eq(activities.visibility, "public"), inArray(activities.userId, friendIds), eq(activities.userId, userId)),
      ),
    )
    .orderBy(desc(activities.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));

  return mapActivityRows(rows);
}

export async function getActivityHistoryForUser(userId: string, limit = 100) {
  const rows = await db
    .select({
      id: activities.id,
      userId: activities.userId,
      type: activities.type,
      metadata: activities.metadata,
      visibility: activities.visibility,
      createdAt: activities.createdAt,
      actorId: users.id,
      actorEmail: users.email,
      actorDisplayName: profiles.displayName,
      actorAvatarUrl: profiles.avatarUrl,
    })
    .from(activities)
    .innerJoin(users, eq(users.id, activities.userId))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(activities.userId, userId))
    .orderBy(desc(activities.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));

  return mapActivityRows(rows);
}
