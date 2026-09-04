import { ccc } from "@ckb-ccc/core";
import { submitDidVerificationMethodUpdate } from "@ckb-passport/siwd-verify";
import { createDidLockSignerFromPrivateKey } from "../lib/did-lock-signer";

export type DidUpdateRouteOptions = {
  body: unknown;
  client: ccc.Client;
  env: Record<string, string | undefined>;
};

export type DidUpdateRouteResult = {
  status: number;
  body: unknown;
};

export async function handleDidUpdateRequest(
  options: DidUpdateRouteOptions,
): Promise<DidUpdateRouteResult> {
  const parsed = readDidUpdateBody(options.body);
  if (!parsed.ok) {
    return {
      status: 400,
      body: parsed,
    };
  }
  const { did, keyId, didKey } = parsed;
  const feeRate = parsed.feeRate;

  if (options.env.CKB_PASSPORT_ENABLE_DID_UPDATE !== "1") {
    return {
      status: 400,
      body: {
        ok: false,
        code: "did_update_disabled",
        message: "live DID update is disabled for this demo server",
      },
    };
  }
  if (!options.env.CKB_PASSPORT_DID_LOCK_PRIVATE_KEY) {
    return {
      status: 400,
      body: {
        ok: false,
        code: "missing_live_update_env",
        message: "live DID update requires the DID controller private key",
      },
    };
  }

  const signer = await createDidLockSignerFromPrivateKey({
    client: options.client,
    did,
    privateKey: options.env.CKB_PASSPORT_DID_LOCK_PRIVATE_KEY,
  });
  if (!signer.ok) {
    return {
      status: 400,
      body: signer,
    };
  }

  const result = await submitDidVerificationMethodUpdate({
    client: options.client,
    signer: signer.signer,
    did,
    keyId,
    didKey,
    feeRate,
  });

  if (!result.ok) {
    return {
      status: 400,
      body: result,
    };
  }

  return {
    status: 200,
    body: {
      ok: true,
      did: result.did,
      keyId: result.keyId,
      didKey: result.didKey,
      txHash: result.txHash,
      capacityShannons: result.capacityShannons,
      feeRateShannonsPerKw: result.feeRateShannonsPerKw,
      feePaidShannons: result.feePaidShannons,
      signerKind: signer.kind,
      note: "passkey did:key was written with the DID cell lock signer",
    },
  };
}

function readDidUpdateBody(
  body: unknown,
):
  | {
      ok: true;
      did: string;
      keyId: string;
      didKey: string;
      feeRate: string;
    }
  | {
      ok: false;
      code: "request_field_invalid" | "fee_rate_invalid";
      message: string;
    } {
  if (!isRecord(body)) {
    return {
      ok: false,
      code: "request_field_invalid",
      message: "request body must be an object",
    };
  }

  for (const field of ["did", "keyId", "didKey"]) {
    if (typeof body[field] !== "string" || body[field].length === 0) {
      return {
        ok: false,
        code: "request_field_invalid",
        message: `${field} must be a non-empty string`,
      };
    }
  }

  const did = body.did;
  const keyId = body.keyId;
  const didKey = body.didKey;
  const feeRate = readFeeRateShannonsPerKw(body.feeRate);
  if (!feeRate.ok) {
    return feeRate;
  }

  if (
    typeof did !== "string" ||
    typeof keyId !== "string" ||
    typeof didKey !== "string"
  ) {
    return {
      ok: false,
      code: "request_field_invalid",
      message: "did, keyId, and didKey must be strings",
    };
  }

  return {
    ok: true,
    did,
    keyId,
    didKey,
    feeRate: feeRate.value,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFeeRateShannonsPerKw(value: unknown):
  | { ok: true; value: string }
  | { ok: false; code: "fee_rate_invalid"; message: string } {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: "1000" };
  }
  if (typeof value !== "string" && typeof value !== "number") {
    return {
      ok: false,
      code: "fee_rate_invalid",
      message: "feeRate must be a positive integer string",
    };
  }

  const text = String(value).trim();
  if (!/^[1-9][0-9]*$/.test(text)) {
    return {
      ok: false,
      code: "fee_rate_invalid",
      message: "feeRate must be a positive integer string",
    };
  }
  return { ok: true, value: text };
}
