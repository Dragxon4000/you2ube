import { NextResponse } from "next/server";
import { claimReward, ProgressionError } from "@/lib/progression";
import {
  withAuth, apiError, ErrorCode, isPositiveInt, log,
} from "@/lib/api-helpers";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAuth(async ({ user }) => {
    const { id } = await params;
    const rewardId = parseInt(id, 10);
    if (!isPositiveInt(rewardId, 1_000_000)) {
      return apiError(400, ErrorCode.INVALID_INPUT, "Invalid reward id");
    }

    try {
      const result = await claimReward(user.id, rewardId);
      return NextResponse.json({ success: true, ...result });
    } catch (err) {
      if (err instanceof ProgressionError) {
        // Stable error codes — no message parsing, no SQL leak.
        switch (err.code) {
          case "NOT_FOUND":
            return apiError(404, ErrorCode.NOT_FOUND, "Reward not found");
          case "USER_NOT_FOUND":
            return apiError(404, ErrorCode.NOT_FOUND, "User not found");
          case "LEVEL_TOO_LOW":
            return apiError(403, ErrorCode.FORBIDDEN, "Level too low to claim this reward");
          case "ALREADY_CLAIMED":
            return NextResponse.json({ success: true, alreadyClaimed: true });
        }
      }
      // Unexpected error — log with full details server-side, return generic
      // message to the client. Never leak raw Postgres errors.
      log("error", "claimReward unexpected error", {
        userId: user.id,
        rewardId,
        error: (err as Error).message,
        stack: (err as Error).stack,
      });
      return apiError(500, ErrorCode.INTERNAL, "Failed to claim reward");
    }
  });
}
