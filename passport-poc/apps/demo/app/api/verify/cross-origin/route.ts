import { NextResponse } from "next/server";
import {
  apiErrorResponse,
  readJsonRecord,
  verifyCrossOriginProofFromUi,
} from "../../../../lib/server-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJsonRecord(request);
    const result = await verifyCrossOriginProofFromUi(body);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
