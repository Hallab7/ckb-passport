import { NextResponse } from "next/server";
import {
  apiErrorResponse,
  convertAttestationToDidKey,
  readJsonRecord,
  requireString,
} from "../../../../lib/server-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJsonRecord(request);
    const attestationObject = requireString(body, "attestationObject");
    const result = await convertAttestationToDidKey(attestationObject);
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
