import { NextResponse, type NextRequest } from "next/server";
import {
  apiErrorResponse,
  buildDemoMessage,
  getRuntime,
  nonceService,
} from "../../../lib/server-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { config } = await getRuntime();
    const url = new URL(request.url);
    const nonce = nonceService.issue();
    const did = url.searchParams.get("did")?.trim();
    const keyId = url.searchParams.get("keyId")?.trim();
    const payload: Record<string, unknown> = {
      ok: true,
      nonce: nonce.nonce,
      issuedAt: nonce.issuedAt.toISOString(),
      expirationTime: nonce.expirationTime.toISOString(),
      expectedOrigin: config.expectedOrigin,
      network: config.network,
      rpId: new URL(config.expectedOrigin).hostname,
    };

    if (did && keyId) {
      payload.message = buildDemoMessage(config, {
        did,
        keyId,
        nonce: nonce.nonce,
        issuedAt: nonce.issuedAt,
        expirationTime: nonce.expirationTime,
      });
    }

    return NextResponse.json(payload);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
