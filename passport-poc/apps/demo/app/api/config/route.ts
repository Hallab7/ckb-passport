import { NextResponse } from "next/server";
import { apiErrorResponse, configPayload, getRuntime } from "../../../lib/server-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const { config } = await getRuntime();
    return NextResponse.json(configPayload(config));
  } catch (error) {
    return apiErrorResponse(error);
  }
}
