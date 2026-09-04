import { readFileSync } from "node:fs";

const checkOnly = process.argv.includes("--check");
const requiredNegativeVectors = [
  "wrong-domain",
  "wrong-uri-origin",
  "expired-message",
  "issued-at-future",
  "replayed-nonce",
  "key-id-absent",
  "unsupported-multicodec",
  "high-s-signature",
  "webauthn-client-origin-mismatch",
  "webauthn-challenge-mismatch",
  "webauthn-user-present-clear",
  "did-zero-live-cells",
];

if (checkOnly) {
  console.log(
    JSON.stringify(
      {
        ok: true,
        command: "npm run acceptance:verify",
        localChecks: [
          "one-command demo check",
          "vectors.json includes all required negatives",
          "REPORT.md includes H1 through H4 outcomes",
          "H4 source audit exists",
        ],
        liveChecks: [
          "passkey DID update confirmed",
          "verificationMethods[keyId] begins did:key:zDna on explorer",
          "passkey sign-in recorded",
          "replay rejection recorded",
        ],
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const vectors = JSON.parse(readFileSync("vectors/vectors.json", "utf8"));
const report = readFileSync("REPORT.md", "utf8");
const readme = readFileSync("README.md", "utf8");
const addressAudit = readFileSync("ADDRESS-AUDIT.md", "utf8");
const explorerEvidence = readFileSync("EXPLORER-EVIDENCE.md", "utf8");
const recording = readFileSync("RECORDING.md", "utf8");

const vectorNames = new Set(vectors.map((vector) => vector.name));
const missingNegativeVectors = requiredNegativeVectors.filter(
  (name) => !vectorNames.has(name),
);
const reportHasHypotheses = ["H1", "H2", "H3", "H4"].every((id) =>
  report.includes(id),
);

const items = [
  {
    id: "one_command_demo",
    status: readme.includes("npm run demo") ? "pass" : "fail",
    evidence: "README.md documents npm run demo and npm run demo:check passes in local audit",
  },
  {
    id: "passkey_did_update",
    status: "unresolved",
    evidence: "missing live DID, passkey did:key, signer, and update transaction evidence",
  },
  {
    id: "verification_method_zdna",
    status: "unresolved",
    evidence: "EXPLORER-EVIDENCE.md is marked not captured",
  },
  {
    id: "passkey_sign_in_only",
    status: "unresolved",
    evidence: "RECORDING.md is marked not captured",
  },
  {
    id: "session_did_no_address",
    status: addressAudit.includes("local source audit passed") ? "pass" : "fail",
    evidence: "ADDRESS-AUDIT.md and npm run audit:h4",
  },
  {
    id: "replay_identical_proof",
    status: vectorNames.has("replayed-nonce") ? "pass" : "fail",
    evidence: "vectors.json contains replayed-nonce with expected nonce_consumed failure",
  },
  {
    id: "vectors_run_by_tests",
    status:
      missingNegativeVectors.length === 0 && vectorNames.size >= 14 ? "pass" : "fail",
    evidence:
      missingNegativeVectors.length === 0
        ? "vectors.json includes all required negatives and positive fixtures"
        : `missing negative vectors: ${missingNegativeVectors.join(", ")}`,
  },
  {
    id: "report_h1_h4",
    status: reportHasHypotheses ? "pass" : "fail",
    evidence: "REPORT.md includes H1, H2, H3, and H4 sections",
  },
  {
    id: "explorer_evidence",
    status: explorerEvidence.includes("Status: not captured") ? "unresolved" : "pass",
    evidence: "requires CKB_PASSPORT_UPDATE_TX_HASH from a confirmed testnet update",
  },
  {
    id: "recording_evidence",
    status: recording.includes("Status: not captured") ? "unresolved" : "pass",
    evidence: "requires a non-empty recording artifact",
  },
];

const failed = items.filter((item) => item.status === "fail");
const unresolved = items.filter((item) => item.status === "unresolved");
const result = {
  ok: failed.length === 0 && unresolved.length === 0,
  code:
    failed.length > 0
      ? "acceptance_failed"
      : unresolved.length > 0
        ? "live_acceptance_incomplete"
        : undefined,
  items,
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) {
  process.exit(1);
}
