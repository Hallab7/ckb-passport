import { ccc } from "@ckb-ccc/core";
import { submitDidVerificationMethodUpdate } from "../packages/siwd-verify/dist/index.js";

const required = [
  "CKB_PASSPORT_LIVE_DID",
  "CKB_PASSPORT_AUTH_DID_KEY",
  "CKB_PASSPORT_DID_LOCK_PRIVATE_KEY",
];

const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        code: "missing_live_update_env",
        message: "Live DID update requires explicit testnet signer configuration",
        missing,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const client = new ccc.ClientPublicTestnet(
  process.env.CKB_RPC_URL ? { url: process.env.CKB_RPC_URL } : undefined,
);
const signer = new ccc.SignerCkbPrivateKey(
  client,
  process.env.CKB_PASSPORT_DID_LOCK_PRIVATE_KEY,
);

const result = await submitDidVerificationMethodUpdate({
  client,
  signer,
  did: process.env.CKB_PASSPORT_LIVE_DID,
  didKey: process.env.CKB_PASSPORT_AUTH_DID_KEY,
  keyId: process.env.CKB_PASSPORT_AUTH_KEY_ID ?? "auth-1",
  feeRate: process.env.CKB_PASSPORT_FEE_RATE_SHANNONS_PER_KW,
});

console.log(
  JSON.stringify(
    result.ok
      ? {
          ok: true,
          did: result.did,
          keyId: result.keyId,
          didKey: result.didKey,
          txHash: result.txHash,
          capacityShannons: result.capacityShannons,
          feeRateShannonsPerKw: result.feeRateShannonsPerKw,
          feePaidShannons: result.feePaidShannons,
          note: "The auth did:key was written using the DID cell lock signer, not the auth key.",
        }
      : result,
    null,
    2,
  ),
);

if (!result.ok) {
  process.exit(1);
}
