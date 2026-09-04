import { NextResponse } from "next/server";
import {
  apiErrorResponse,
  readJsonRecord,
} from "../../../../lib/server-runtime";
import { submitDidUpdateFromUi } from "../../../../lib/did-update-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJsonRecord(request);
    const result = await submitDidUpdateFromUi(body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
