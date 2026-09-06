import { ccc } from "@ckb-ccc/core";
import {
  base64UrlDecode,
  buildSiwdMessage,
  bytesToHex,
  decodeDidKey,
  type SiwdMessageFields,
} from "@ckb-passport/siwd-core";
import { passkeyAttestationToDidKey } from "@ckb-passport/siwd-browser";
import {
  checkDidVerificationMethodRoundTrip,
  decodeDidDocumentFromCell,
  InMemoryNonceService,
  InMemorySessionService,
  loadPassportPocConfig,
  resolveDidCell,
  verifySiwdMessageChecks,
  verifySiwdProof,
  verifySoftwareSignature,
  verifyWebAuthnSignature,
  type PassportPocConfig,
  type PassportSession,
} from "@ckb-passport/siwd-verify";
import { NextResponse, type NextRequest } from "next/server";

export const SESSION_COOKIE = "ckb_passport_session";
export const DEFAULT_KEY_ID = "auth-1";
export const DEFAULT_FEE_RATE_SHANNONS_PER_KW = "1000";

const SIWD_STATEMENT = "Sign in to Passport PoC";
const PUDGE_EXPLORER_BASE_URL = "https://pudge.explorer.nervos.org";

type PassportDemoGlobals = typeof globalThis & {
  __ckbPassportNonceService?: InMemoryNonceService;
  __ckbPassportSessionService?: InMemorySessionService;
};

const passportGlobals = globalThis as PassportDemoGlobals;

export const nonceService =
  passportGlobals.__ckbPassportNonceService ?? new InMemoryNonceService();
passportGlobals.__ckbPassportNonceService = nonceService;

export const sessionService =
  passportGlobals.__ckbPassportSessionService ?? new InMemorySessionService();
passportGlobals.__ckbPassportSessionService = sessionService;

export async function getRuntime(): Promise<{
  config: PassportPocConfig;
  client: ccc.Client;
}> {
  const config = await loadPassportPocConfig();
  return {
    config,
    client: new ccc.ClientPublicTestnet({ url: config.ckbRpcUrl }),
  };
}

export function configPayload(
  config: PassportPocConfig,
): Record<string, unknown> {
  return {
    ok: true,
    network: config.network,
    expectedOrigin: config.expectedOrigin,
    rpId: new URL(config.expectedOrigin).hostname,
    didCodeHash: config.didCodeHash,
    didHashType: config.didHashType,
    didUpdateInput: "browser-evm-wallet",
    hasServerDidLockSigner: Boolean(process.env.CKB_PASSPORT_DID_LOCK_PRIVATE_KEY),
    defaultKeyId: DEFAULT_KEY_ID,
    defaultFeeRateShannonsPerKw: DEFAULT_FEE_RATE_SHANNONS_PER_KW,
  };
}

export function buildDemoMessage(
  config: PassportPocConfig,
  fields: {
    did: string;
    keyId: string;
    nonce: string;
    issuedAt: Date;
    expirationTime: Date;
  },
): string {
  const message: SiwdMessageFields = {
    domain: new URL(config.expectedOrigin).host,
    did: fields.did,
    statement: SIWD_STATEMENT,
    keyId: fields.keyId,
    uri: new URL("/login", config.expectedOrigin).toString(),
    version: "1",
    network: config.network,
    nonce: fields.nonce,
    issuedAt: fields.issuedAt.toISOString(),
    expirationTime: fields.expirationTime.toISOString(),
  };
  return buildSiwdMessage(message);
}

export async function convertAttestationToDidKey(
  attestationObject: string,
): Promise<Record<string, unknown>> {
  const result = passkeyAttestationToDidKey(base64UrlDecode(attestationObject));
  return {
    ok: true,
    didKey: result.didKey,
    compressedPublicKey: bytesToHex(result.compressedPublicKey),
  };
}

export async function verifyAuthKeyProofOfPossession(
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const did = requireString(body, "did");
  const didKey = requireString(body, "didKey");
  const keyId = optionalString(body, "keyId") ?? DEFAULT_KEY_ID;
  const proof = body.proof;
  if (!isRecord(proof)) {
    throw new ApiError(400, "proof_invalid", "proof must be an object");
  }

  const { config } = await getRuntime();
  const messageChecks = verifySiwdMessageChecks({
    proof,
    expectedOrigin: config.expectedOrigin,
    expectedNetwork: config.network,
    nonceService,
  });
  if (!messageChecks.ok) {
    return {
      ...messageChecks,
      did,
      keyId,
      didKey,
    };
  }

  if (messageChecks.fields.did !== did) {
    return {
      ok: false,
      code: "proof_did_mismatch",
      message: "Proof DID must match the DID receiving this auth key",
      did,
      keyId,
      didKey,
    };
  }
  if (messageChecks.fields.keyId !== keyId) {
    return {
      ok: false,
      code: "proof_key_id_mismatch",
      message: "Proof key ID must match the DID document key ID",
      did,
      keyId,
      didKey,
    };
  }

  let decoded: ReturnType<typeof decodeDidKey>;
  try {
    decoded = decodeDidKey(didKey);
  } catch (error) {
    return {
      ok: false,
      code: "did_key_invalid",
      message:
        error instanceof Error ? error.message : "did:key could not be decoded",
      did,
      keyId,
      didKey,
    };
  }

  const verificationMethod = {
    ok: true as const,
    keyId,
    didKey,
    decoded,
  };
  const signature =
    messageChecks.proof.mode === "software"
      ? verifySoftwareSignature({
          proof: messageChecks.proof,
          verificationMethod,
        })
      : verifyWebAuthnSignature({
          proof: messageChecks.proof,
          verificationMethod,
          expectedOrigin: config.expectedOrigin,
          rpId: new URL(config.expectedOrigin).hostname,
        });

  if (!signature.ok) {
    return {
      ...signature,
      did,
      keyId,
      didKey,
    };
  }

  return {
    ok: true,
    did,
    keyId,
    didKey,
    mode: messageChecks.proof.mode,
  };
}

export async function resolveDidForUi(
  did: string,
): Promise<Record<string, unknown>> {
  const { client } = await getRuntime();
  const resolution = await resolveDidCell({ client, did });
  if (!resolution.ok) {
    return resolution;
  }

  const decoded = decodeDidDocumentFromCell(resolution.cell);
  if (!decoded.ok) {
    return {
      ok: false,
      code: "did_document_decode_failed",
      message: decoded.message,
      did,
      id: resolution.id,
      typeScript: serializeScript(resolution.typeScript),
      capacityShannons: stringifyCapacity(resolution.cell.cellOutput.capacity),
    };
  }

  return {
    ok: true,
    did,
    id: resolution.id,
    typeScript: serializeScript(resolution.typeScript),
    capacityShannons: stringifyCapacity(resolution.cell.cellOutput.capacity),
    verificationMethodKeys: Object.keys(decoded.document.verificationMethods),
    verificationMethods: decoded.document.verificationMethods,
  };
}

export async function checkRoundTripFromUi(
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const did = requireString(body, "did");
  const didKey = requireString(body, "didKey");
  const keyId = optionalString(body, "keyId") ?? DEFAULT_KEY_ID;
  const { client } = await getRuntime();
  return checkDidVerificationMethodRoundTrip({
    client,
    did,
    keyId,
    expectedDidKey: didKey,
  });
}

export function explorerEvidenceFromUi(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const did = requireString(body, "did");
  const didKey = requireString(body, "didKey");
  const txHash = requireString(body, "txHash");
  const keyId = optionalString(body, "keyId") ?? DEFAULT_KEY_ID;
  const capacityShannons = optionalString(body, "capacityShannons");
  const failures = [];

  if (!/^did:ckb:[a-z2-7]{32}$/.test(did)) {
    failures.push("DID must be did:ckb plus 32 lowercase base32 characters");
  }
  if (!didKey.startsWith("did:key:zDna")) {
    failures.push("Passkey verification method must begin did:key:zDna");
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    failures.push("Update transaction hash must be a 32-byte 0x-prefixed hash");
  }
  if (capacityShannons && !/^[0-9]+$/.test(capacityShannons)) {
    failures.push("Capacity must be an integer number of shannons");
  }

  if (failures.length > 0) {
    return {
      ok: false,
      code: "explorer_evidence_invalid",
      failures,
    };
  }

  return {
    ok: true,
    network: "ckb-testnet",
    explorer: PUDGE_EXPLORER_BASE_URL,
    did,
    keyId,
    didKey,
    updateTransactionHash: txHash,
    updateTransactionUrl: `${PUDGE_EXPLORER_BASE_URL}/transaction/${txHash}`,
    capacityShannons: capacityShannons ?? null,
  };
}

export async function verifyProofFromUi(
  body: Record<string, unknown>,
): Promise<{
  response: NextResponse;
}> {
  const proof = "proof" in body ? body.proof : body;
  const { client, config } = await getRuntime();
  const result = await verifySiwdProof({
    proof,
    expectedOrigin: config.expectedOrigin,
    expectedNetwork: config.network,
    nonceService,
    client,
    rpId: new URL(config.expectedOrigin).hostname,
  });

  if (!result.ok) {
    return {
      response: NextResponse.json(result, { status: 400 }),
    };
  }

  const issued = sessionService.issue(result.did, result.keyId);
  const response = NextResponse.json({
    ok: true,
    did: result.did,
    keyId: result.keyId,
    mode: result.mode,
    session: serializeSession(issued.session),
  });
  response.cookies.set(SESSION_COOKIE, issued.token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds(issued.session),
  });
  return { response };
}

export function currentSession(request: NextRequest): Record<string, unknown> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = sessionService.get(token);
  return {
    ok: true,
    authenticated: Boolean(session),
    session: session ? serializeSession(session) : null,
  };
}

export function clearSession(request: NextRequest): NextResponse {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const cleared = sessionService.clear(token);
  const response = NextResponse.json({ ok: true, cleared });
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function readJsonRecord(
  request: Request,
): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "json_invalid", "Request body must be valid JSON");
  }
  if (!isRecord(body)) {
    throw new ApiError(400, "request_body_invalid", "Request body must be an object");
  }
  return body;
}

export function requireString(
  body: Record<string, unknown>,
  field: string,
): string {
  const value = body[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(400, "request_field_invalid", `${field} must be a non-empty string`);
  }
  return value.trim();
}

export function optionalString(
  body: Record<string, unknown>,
  field: string,
): string | undefined {
  const value = body[field];
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ApiError(400, "request_field_invalid", `${field} must be a string`);
  }
  return value.trim();
}

export function readFeeRateShannonsPerKw(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_FEE_RATE_SHANNONS_PER_KW;
  }
  if (typeof value !== "string" && typeof value !== "number") {
    throw new ApiError(
      400,
      "fee_rate_invalid",
      "feeRate must be a positive integer string",
    );
  }

  const text = String(value).trim();
  if (!/^[1-9][0-9]*$/.test(text)) {
    throw new ApiError(
      400,
      "fee_rate_invalid",
      "feeRate must be a positive integer string",
    );
  }
  return text;
}

export function apiErrorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        ok: false,
        code: error.code,
        message: error.message,
      },
      { status: error.status },
    );
  }

  return NextResponse.json(
    {
      ok: false,
      code: "internal_error",
      message: error instanceof Error ? error.message : "Internal server error",
    },
    { status: 500 },
  );
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function serializeSession(session: PassportSession): Record<string, string> {
  return {
    did: session.did,
    keyId: session.keyId,
    issuedAt: session.issuedAt.toISOString(),
    expirationTime: session.expirationTime.toISOString(),
  };
}

function maxAgeSeconds(session: PassportSession): number {
  return Math.max(0, Math.floor((session.expirationTime.getTime() - Date.now()) / 1000));
}

function serializeScript(script: ccc.Script): Record<string, string> {
  return {
    codeHash: script.codeHash,
    hashType: script.hashType,
    args: script.args,
  };
}

function stringifyCapacity(capacity: unknown): string | undefined {
  if (capacity === undefined || capacity === null) {
    return undefined;
  }
  if (typeof capacity === "bigint") {
    return capacity.toString();
  }
  if (typeof capacity === "number" || typeof capacity === "string") {
    return String(capacity);
  }
  if (
    typeof capacity === "object" &&
    capacity !== null &&
    "toString" in capacity &&
    typeof capacity.toString === "function"
  ) {
    return capacity.toString();
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
