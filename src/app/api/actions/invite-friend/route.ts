import { NextResponse } from "next/server";
import { friendInvites } from "@/db/schema";
import { eq } from "drizzle-orm";
import { awardXp, runProgressionTx } from "@/lib/progression";
import {
  withAuth, parseJsonBody, apiError, ErrorCode,
  checkIdempotencyKey, checkRateLimit, USERNAME_REGEX, log,
} from "@/lib/api-helpers";

const RATE_LIMIT_PER_MINUTE = 10;

// POST /api/actions/invite-friend
export async function POST(req: Request) {
  return withAuth(async ({ user }) => {
    const rl = checkRateLimit(`invite:${user.id}`, RATE_LIMIT_PER_MINUTE);
    if (!rl.allowed) {
      return apiError(429, ErrorCode.RATE_LIMITED, "Too many requests. Try again in a minute.", {
        resetAt: rl.resetAt,
      });
    }

    const body = await parseJsonBody<{
      inviteeUsername?: unknown;
      idempotencyKey?: unknown;
    }>(req);
    if (!body.ok) return body.response;

    const { inviteeUsername, idempotencyKey } = body.data;
    const raw = typeof inviteeUsername === "string" ? inviteeUsername.trim() : "";
    if (!USERNAME_REGEX.test(raw)) {
      return apiError(400, ErrorCode.INVALID_INPUT, "inviteeUsername must be 2-30 chars, alphanumeric with _ or -");
    }
    if (raw.toLowerCase() === user.username.toLowerCase()) {
      return apiError(400, ErrorCode.INVALID_INPUT, "You can't invite yourself");
    }

    const idemKey = typeof idempotencyKey === "string" ? idempotencyKey : undefined;
    const idemCheck = await checkIdempotencyKey(user.id, idemKey);
    if (idemCheck.duplicate) {
      return NextResponse.json({
        success: true,
        idempotentReplay: true,
        message: "This action was already processed.",
        result: { xpGained: idemCheck.existingAmount ?? 0 },
      });
    }

    try {
      const out = await runProgressionTx(async (tx) => {
        const [invite] = await tx.insert(friendInvites).values({
          inviterId: user.id,
          inviteeUsername: raw,
          xpEarned: 0,
          accepted: true, // simulate acceptance for demo
        }).returning();

        const result = await awardXp({
          userId: user.id,
          action: "invite_friend",
          referenceType: "friend_invite",
          referenceId: invite.id,
          contextMessage: `Invited ${raw} to you2ube — they accepted!`,
          idempotencyKey: idemKey,
          tx,
        });

        await tx.update(friendInvites).set({ xpEarned: result.xpGained }).where(eq(friendInvites.id, invite.id));

        return { invite, result };
      });

      return NextResponse.json({
        success: true,
        invite: { id: out.invite.id, inviteeUsername: out.invite.inviteeUsername },
        result: out.result,
      });
    } catch (err) {
      log("error", "invite-friend action failed", { userId: user.id, error: (err as Error).message });
      return apiError(500, ErrorCode.INTERNAL, "Failed to record invite");
    }
  });
}
