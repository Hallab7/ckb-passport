import { existsSync, readFileSync } from "node:fs";

const checkOnly = process.argv.includes("--check");
const requiredLiveEnv = [
  "CKB_PASSPORT_LIVE_DID",
  "CKB_PASSPORT_AUTH_DID_KEY",
];

if (checkOnly) {
  console.log(
    JSON.stringify(
      {
        ok: true,
        command: "npm run drill:testnet",
        requiredLiveEnv,
        optionalLiveEnv: [
          "CKB_PASSPORT_AUTH_KEY_ID",
          "CKB_PASSPORT_LIVE_PROOF_FILE",
          "CKB_PASSPORT_DID_LOCK_PRIVATE_KEY",
          "CKB_RPC_URL",
          "SIWD_EXPECTED_ORIGIN",
        ],
        checks: [
          "resolve configured testnet DID",
          "check verificationMethods[keyId] equals the passkey did:key",
          "verify an optional captured live proof file",
          "issue a DID-only demo session after proof verification",
          "verify replay of the same proof fails with nonce_consumed",
        ],
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const missing = requiredLiveEnv.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        code: "missing_e2e_testnet_inputs",
        message: "live testnet drill requires a DID and expected passkey did:key",
        missing,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const { ccc } = await import("@ckb-ccc/core");
const { parseSiwdMessage } = await import("../packages/siwd-core/dist/index.js");
const {
  InMemoryNonceService,
  InMemorySessionService,
  checkDidVerificationMethodRoundTrip,
  loadPassportPocConfig,
  verifySiwdProof,
} = await import("../packages/siwd-verify/dist/index.js");

const config = await loadPassportPocConfig();
const client = new ccc.ClientPublicTestnet({ url: config.ckbRpcUrl });
const did = process.env.CKB_PASSPORT_LIVE_DID;
const didKey = process.env.CKB_PASSPORT_AUTH_DID_KEY;
const keyId = process.env.CKB_PASSPORT_AUTH_KEY_ID ?? "auth-1";

const roundTrip = await checkDidVerificationMethodRoundTrip({
  client,
  did,
  keyId,
  expectedDidKey: didKey,
});

const proofFile = process.env.CKB_PASSPORT_LIVE_PROOF_FILE;
const proofCheck = proofFile
  ? await verifyCapturedProof({
      proofFile,
      client,
      config,
    })
  : {
      ok: false,
      status: "missing_live_proof_file",
      message: "set CKB_PASSPORT_LIVE_PROOF_FILE to a captured WebAuthn or wallet proof JSON file",
    };

const report = {
  ok: roundTrip.ok && proofCheck.ok,
  did,
  keyId,
  expectedDidKey: didKey,
  roundTrip,
  proofCheck,
  updateSignerPresent: Boolean(process.env.CKB_PASSPORT_DID_LOCK_PRIVATE_KEY),
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) {
  process.exit(1);
}

async function verifyCapturedProof({ proofFile, client, config }) {
  if (!existsSync(proofFile)) {
    return {
      ok: false,
      status: "proof_file_not_found",
      proofFile,
    };
  }

  const parsed = JSON.parse(readFileSync(proofFile, "utf8"));
  const proof = parsed.proof ?? parsed;
  const fields = parseSiwdMessage(proof.message);
  const nonceService = new InMemoryNonceService();
  nonceService.issue(fields.nonce);

  const first = await verifySiwdProof({
    proof,
    expectedOrigin: config.expectedOrigin,
    expectedNetwork: config.network,
    nonceService,
    client,
    rpId: new URL(config.expectedOrigin).hostname,
  });
  if (!first.ok) {
    return {
      ok: false,
      status: "proof_verification_failed",
      first,
    };
  }

  const sessions = new InMemorySessionService();
  const issued = sessions.issue(first.did, first.keyId);
  const replay = await verifySiwdProof({
    proof,
    expectedOrigin: config.expectedOrigin,
    expectedNetwork: config.network,
    nonceService,
    client,
    rpId: new URL(config.expectedOrigin).hostname,
  });

  return {
    ok: !replay.ok && replay.code === "nonce_consumed",
    status: "proof_verified",
    first,
    session: {
      did: issued.session.did,
      keyId: issued.session.keyId,
      issuedAt: issued.session.issuedAt.toISOString(),
      expirationTime: issued.session.expirationTime.toISOString(),
    },
    replay,
  };
}
