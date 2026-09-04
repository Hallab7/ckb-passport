import { ccc } from "@ckb-ccc/core";
import { checkDidVerificationMethodRoundTrip } from "../packages/siwd-verify/dist/index.js";

const required = ["CKB_PASSPORT_LIVE_DID", "CKB_PASSPORT_AUTH_DID_KEY"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        code: "missing_roundtrip_env",
        message: "Round-trip check requires a testnet DID and expected did:key",
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
const result = await checkDidVerificationMethodRoundTrip({
  client,
  did: process.env.CKB_PASSPORT_LIVE_DID,
  expectedDidKey: process.env.CKB_PASSPORT_AUTH_DID_KEY,
  keyId: process.env.CKB_PASSPORT_AUTH_KEY_ID ?? "auth-1",
});

console.log(JSON.stringify(result, null, 2));

if (!result.ok) {
  process.exit(1);
}
