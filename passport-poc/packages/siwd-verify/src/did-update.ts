import { decodeDidKey } from "@ckb-passport/siwd-core";
import { ccc } from "@ckb-ccc/core";
import { DidCkbData, transferDidCkb } from "@ckb-ccc/did-ckb";
import {
  type DidCkbDocument,
  validateDidCkbDocument,
} from "./document.js";
import { resolveDidCell } from "./resolver.js";

export type DidVerificationMethodUpdateResult =
  | {
      ok: true;
      keyId: string;
      didKey: string;
      previousDidKey?: string;
      document: DidCkbDocument;
    }
  | {
      ok: false;
      code:
        | "key_id_invalid"
        | "did_key_invalid"
        | "did_key_not_p256"
        | "did_document_invalid";
      message: string;
      keyId: string;
      didKey: string;
    };

export type DidVerificationMethodUpdateFailureCode =
  | "key_id_invalid"
  | "did_key_invalid"
  | "did_key_not_p256"
  | "did_document_invalid";

export type DidTransferFunction = typeof transferDidCkb;

export type PreparedDidVerificationMethodUpdate =
  | {
      ok: true;
      did: string;
      id: string;
      keyId: string;
      didKey: string;
      tx: ccc.Transaction;
      inIndex: number;
      outIndex: number;
      capacityShannons?: string;
      feeRateShannonsPerKw?: string;
      feePaidShannons?: string;
    }
  | {
      ok: false;
      code:
        | DidVerificationMethodUpdateFailureCode
        | "did_cell_resolve_failed"
        | "did_update_prepare_failed";
      message: string;
      did: string;
      keyId: string;
      didKey: string;
    };

export type SubmittedDidVerificationMethodUpdate =
  | (Extract<PreparedDidVerificationMethodUpdate, { ok: true }> & {
      txHash: string;
    })
  | (Extract<PreparedDidVerificationMethodUpdate, { ok: false }> & {
      txHash?: undefined;
    })
  | {
      ok: false;
      code: "did_update_submit_failed";
      message: string;
      did: string;
      keyId: string;
      didKey: string;
    };

export type PrepareDidVerificationMethodUpdateOptions = {
  client: ccc.Client;
  did: string;
  didKey: string;
  keyId?: string;
  transfer?: DidTransferFunction;
};

export type SubmitDidVerificationMethodUpdateOptions =
  PrepareDidVerificationMethodUpdateOptions & {
    signer: ccc.Signer;
    feeRate?: ccc.NumLike;
  };

const DEFAULT_KEY_ID = "auth-1";
const DEFAULT_FEE_RATE_SHANNONS_PER_KW = 1000n;

export function upsertP256VerificationMethod(
  document: unknown,
  didKey: string,
  keyId = DEFAULT_KEY_ID,
): DidVerificationMethodUpdateResult {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(keyId)) {
    return {
      ok: false,
      code: "key_id_invalid",
      message: "verification method keyId must be a compact non-empty token",
      keyId,
      didKey,
    };
  }

  try {
    const decoded = decodeDidKey(didKey);
    if (decoded.curve !== "p256") {
      return {
        ok: false,
        code: "did_key_not_p256",
        message: "passkey registration must write a P-256 did:key",
        keyId,
        didKey,
      };
    }
  } catch (error) {
    return {
      ok: false,
      code: "did_key_invalid",
      message:
        error instanceof Error ? error.message : "verification method did:key is invalid",
      keyId,
      didKey,
    };
  }

  const validation = validateDidCkbDocument(document);
  if (!validation.ok) {
    return {
      ok: false,
      code: "did_document_invalid",
      message: validation.message,
      keyId,
      didKey,
    };
  }

  const previousDidKey = validation.document.verificationMethods[keyId];
  return {
    ok: true,
    keyId,
    didKey,
    previousDidKey,
    document: {
      ...validation.document,
      verificationMethods: {
        ...validation.document.verificationMethods,
        [keyId]: didKey,
      },
    },
  };
}

export async function prepareDidVerificationMethodUpdate(
  options: PrepareDidVerificationMethodUpdateOptions,
): Promise<PreparedDidVerificationMethodUpdate> {
  const keyId = options.keyId ?? DEFAULT_KEY_ID;
  const resolution = await resolveDidCell({
    client: options.client,
    did: options.did,
  });

  if (!resolution.ok) {
    return {
      ok: false,
      code: "did_cell_resolve_failed",
      message: resolution.message,
      did: options.did,
      keyId,
      didKey: options.didKey,
    };
  }

  try {
    const transfer = options.transfer ?? transferDidCkb;
    const result = await transfer({
      client: options.client,
      id: resolution.id,
      receiver: resolution.cell.cellOutput.lock,
      data: (_cell, currentData) => {
        if (!currentData) {
          throw new Error("DID cell data did not decode");
        }
        const update = upsertP256VerificationMethod(
          currentData.value.document,
          options.didKey,
          keyId,
        );
        if (!update.ok) {
          throw new Error(`${update.code}: ${update.message}`);
        }
        return DidCkbData.fromV1({
          document: update.document,
          localId: currentData.value.localId,
        });
      },
    });

    return {
      ok: true,
      did: options.did,
      id: resolution.id,
      keyId,
      didKey: options.didKey,
      tx: result.tx,
      inIndex: result.inIndex,
      outIndex: result.outIndex,
      capacityShannons: stringifyCapacity(resolution.cell.cellOutput.capacity),
    };
  } catch (error) {
    return {
      ok: false,
      code: "did_update_prepare_failed",
      message:
        error instanceof Error
          ? `DID update transaction could not be prepared: ${error.message}`
          : "DID update transaction could not be prepared",
      did: options.did,
      keyId,
      didKey: options.didKey,
    };
  }
}

export async function submitDidVerificationMethodUpdate(
  options: SubmitDidVerificationMethodUpdateOptions,
): Promise<SubmittedDidVerificationMethodUpdate> {
  const prepared = await prepareDidVerificationMethodUpdate(options);
  if (!prepared.ok) {
    return prepared;
  }

  try {
    const feeRate = options.feeRate ?? DEFAULT_FEE_RATE_SHANNONS_PER_KW;
    await prepared.tx.completeFeeChangeToOutput(
      options.signer,
      prepared.outIndex,
      feeRate,
      undefined,
      { shouldAddInputs: false },
    );
    const feePaidShannons = stringifyCapacity(
      await prepared.tx.getFee(options.client),
    );
    const txHash = await options.signer.sendTransaction(prepared.tx);
    return {
      ...prepared,
      feeRateShannonsPerKw: stringifyCapacity(feeRate),
      feePaidShannons,
      txHash,
    };
  } catch (error) {
    return {
      ok: false,
      code: "did_update_submit_failed",
      message:
        error instanceof Error
          ? `DID update transaction could not be submitted: ${error.message}`
          : "DID update transaction could not be submitted",
      did: prepared.did,
      keyId: prepared.keyId,
      didKey: prepared.didKey,
    };
  }
}

function stringifyCapacity(capacity: unknown): string | undefined {
  if (capacity === undefined || capacity === null) {
    return undefined;
  }
  return typeof capacity === "bigint" ? capacity.toString() : String(capacity);
}
