import { NextResponse, type NextRequest } from "next/server";
import { apiErrorResponse, currentSession } from "../../../lib/server-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(currentSession(request));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
