import { NextResponse } from "next/server";
import { claimReward } from "@/lib/progression";
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
      const msg = (err as Error).message;
      log("warn", "claimReward rejected", { userId: user.id, rewardId, error: msg });
      if (msg.includes("not found")) return apiError(404, ErrorCode.NOT_FOUND, msg);
      if (msg.includes("Level too low")) return apiError(403, ErrorCode.FORBIDDEN, msg);
      return apiError(400, ErrorCode.INVALID_INPUT, msg);
    }
  });
}
