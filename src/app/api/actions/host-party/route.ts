import { NextResponse } from "next/server";
import { watchParties } from "@/db/schema";
import { eq } from "drizzle-orm";
import { awardXp, runProgressionTx } from "@/lib/progression";
import {
  withAuth, parseJsonBody, apiError, ErrorCode,
  checkIdempotencyKey, checkRateLimit, isNonEmptyString, isNonNegativeInt, log,
} from "@/lib/api-helpers";

const MAX_TITLE_LENGTH = 100;
const MAX_ATTENDEES = 50;
const RATE_LIMIT_PER_MINUTE = 10;

// POST /api/actions/host-party
export async function POST(req: Request) {
  return withAuth(async ({ user }) => {
    const rl = checkRateLimit(`host_party:${user.id}`, RATE_LIMIT_PER_MINUTE);
    if (!rl.allowed) {
      return apiError(429, ErrorCode.RATE_LIMITED, "Too many requests. Try again in a minute.", {
        resetAt: rl.resetAt,
      });
    }

    const body = await parseJsonBody<{
      title?: unknown;
      attendeeCount?: unknown;
      idempotencyKey?: unknown;
    }>(req);
    if (!body.ok) return body.response;

    const { title, attendeeCount, idempotencyKey } = body.data;

    if (!isNonEmptyString(title, MAX_TITLE_LENGTH)) {
      return apiError(400, ErrorCode.INVALID_INPUT, `title must be a non-empty string (max ${MAX_TITLE_LENGTH} chars)`);
    }
    if (attendeeCount !== undefined && !isNonNegativeInt(attendeeCount, MAX_ATTENDEES)) {
      return apiError(400, ErrorCode.INVALID_INPUT, `attendeeCount must be an integer between 0 and ${MAX_ATTENDEES}`);
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

    const attendees = typeof attendeeCount === "number" ? attendeeCount : 3;
    const cleanTitle = title.trim().slice(0, MAX_TITLE_LENGTH);
    const bonusFlat = attendees * 10;

    try {
      const out = await runProgressionTx(async (tx) => {
        const [party] = await tx.insert(watchParties).values({
          hostId: user.id,
          title: cleanTitle,
          attendeeCount: attendees,
          xpEarned: 0,
        }).returning();

        const result = await awardXp({
          userId: user.id,
          action: "host_party",
          bonusFlat,
          referenceType: "watch_party",
          referenceId: party.id,
          contextMessage: `Hosted watch party "${cleanTitle}" with ${attendees} attendee${attendees === 1 ? "" : "s"}`,
          idempotencyKey: idemKey,
          tx,
        });

        await tx.update(watchParties).set({ xpEarned: result.xpGained }).where(eq(watchParties.id, party.id));

        return { party, result };
      });

      return NextResponse.json({
        success: true,
        party: { id: out.party.id, title: out.party.title, attendeeCount: attendees },
        result: out.result,
      });
    } catch (err) {
      log("error", "host-party action failed", { userId: user.id, error: (err as Error).message });
      return apiError(500, ErrorCode.INTERNAL, "Failed to host party");
    }
  });
}
