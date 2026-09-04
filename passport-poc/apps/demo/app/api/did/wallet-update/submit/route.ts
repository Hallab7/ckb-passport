import { NextResponse } from "next/server";
import {
  apiErrorResponse,
  readJsonRecord,
} from "../../../../../lib/server-runtime";
import { submitWalletDidUpdateFromUi } from "../../../../../lib/did-wallet-update-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJsonRecord(request);
    const result = await submitWalletDidUpdateFromUi(body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
