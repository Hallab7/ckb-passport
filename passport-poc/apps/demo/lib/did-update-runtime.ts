import { ccc } from "@ckb-ccc/core";
import { submitDidVerificationMethodUpdate } from "@ckb-passport/siwd-verify";
import {
  DEFAULT_KEY_ID,
  getRuntime,
  optionalString,
  requireString,
} from "./server-runtime";

const PUDGE_EXPLORER_BASE_URL = "https://pudge.explorer.nervos.org";

export async function submitDidUpdateFromUi(
  body: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const did = requireString(body, "did");
  const keyId = optionalString(body, "keyId") ?? DEFAULT_KEY_ID;
  const didKey = requireString(body, "didKey");
  const didLockPrivateKey =
    optionalString(body, "didLockPrivateKey") ??
    process.env.CKB_PASSPORT_DID_LOCK_PRIVATE_KEY;

  if (!didLockPrivateKey) {
    return {
      status: 400,
      body: {
        ok: false,
        code: "missing_did_lock_private_key",
        message: "DID update requires the DID cell lock private key",
      },
    };
  }

  const { client } = await getRuntime();
  const signer = new ccc.SignerCkbPrivateKey(client, didLockPrivateKey);
  const result = await submitDidVerificationMethodUpdate({
    client,
    signer,
    did,
    keyId,
    didKey,
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
      explorerUrl: `${PUDGE_EXPLORER_BASE_URL}/transaction/${result.txHash}`,
    },
  };
}
