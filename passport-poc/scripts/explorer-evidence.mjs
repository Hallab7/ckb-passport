const PUDGE_EXPLORER_BASE_URL = "https://pudge.explorer.nervos.org";
const checkOnly = process.argv.includes("--check");
const requiredEnv = [
  "CKB_PASSPORT_LIVE_DID",
  "CKB_PASSPORT_AUTH_DID_KEY",
  "CKB_PASSPORT_UPDATE_TX_HASH",
];

if (checkOnly) {
  console.log(
    JSON.stringify(
      {
        ok: true,
        command: "npm run evidence:explorer",
        explorer: PUDGE_EXPLORER_BASE_URL,
        requiredEnv,
        optionalEnv: ["CKB_PASSPORT_AUTH_KEY_ID", "CKB_PASSPORT_UPDATE_CAPACITY_SHANNONS"],
        output: "validated explorer evidence JSON",
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const missing = requiredEnv.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        code: "missing_explorer_evidence",
        message: "explorer evidence requires a live DID, passkey did:key, and update transaction hash",
        missing,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const did = process.env.CKB_PASSPORT_LIVE_DID;
const keyId = process.env.CKB_PASSPORT_AUTH_KEY_ID ?? "auth-1";
const didKey = process.env.CKB_PASSPORT_AUTH_DID_KEY;
const txHash = process.env.CKB_PASSPORT_UPDATE_TX_HASH;
const capacityShannons = process.env.CKB_PASSPORT_UPDATE_CAPACITY_SHANNONS;

const failures = [];
if (!/^did:ckb:[a-z2-7]{32}$/.test(did)) {
  failures.push("CKB_PASSPORT_LIVE_DID must be did:ckb plus 32 lowercase base32 characters");
}
if (!didKey.startsWith("did:key:zDna")) {
  failures.push("CKB_PASSPORT_AUTH_DID_KEY must be a P-256 did:key beginning did:key:zDna");
}
if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
  failures.push("CKB_PASSPORT_UPDATE_TX_HASH must be a 32-byte 0x-prefixed transaction hash");
}
if (capacityShannons && !/^[0-9]+$/.test(capacityShannons)) {
  failures.push("CKB_PASSPORT_UPDATE_CAPACITY_SHANNONS must be an integer when provided");
}

if (failures.length > 0) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        code: "explorer_evidence_invalid",
        failures,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      network: "ckb-testnet",
      explorer: PUDGE_EXPLORER_BASE_URL,
      did,
      keyId,
      didKey,
      updateTransactionHash: txHash,
      updateTransactionUrl: `${PUDGE_EXPLORER_BASE_URL}/transaction/${txHash}`,
      capacityShannons: capacityShannons ?? null,
    },
    null,
    2,
  ),
);
