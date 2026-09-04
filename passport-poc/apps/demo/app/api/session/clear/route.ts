import type { NextRequest } from "next/server";
import { apiErrorResponse, clearSession } from "../../../../lib/server-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    return clearSession(request);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
