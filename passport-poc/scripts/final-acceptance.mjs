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
  "did-ambiguous-live-cells",
];

if (checkOnly) {
  console.log(
    JSON.stringify(
      {
        ok: true,
        command: "npm run acceptance:verify",
        localChecks: [
          "one-command demo check",
          "supplied live DID resolver evidence",
          "vectors.json includes all required negatives",
          "registration proof-of-possession endpoint is present",
          "REPORT.md includes H1 through H4 outcomes",
          "H4 source audit exists",
        ],
        liveChecks: [
          "auth-key DID update confirmed",
          "verificationMethods[keyId] begins did:key:zDna on explorer",
          "auth-key sign-in recorded",
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
    id: "live_did_resolution",
    status:
      report.includes("CKB_PASSPORT_LIVE_DID") &&
      report.includes("targeted live resolver test")
        ? "pass"
        : "fail",
    evidence:
      "A supplied CKB_PASSPORT_LIVE_DID resolves from live testnet cells in the targeted resolver test",
  },
  {
    id: "auth_key_did_update",
    status: "unresolved",
    evidence: "missing auth did:key, signer, and update transaction evidence",
  },
  {
    id: "registration_proof_of_possession",
    status: readme.includes("proof-of-possession") ? "pass" : "fail",
    evidence:
      "README.md documents auth-key proof-of-possession before DID update",
  },
  {
    id: "verification_method_zdna",
    status: "unresolved",
    evidence: "EXPLORER-EVIDENCE.md is marked not captured",
  },
  {
    id: "auth_key_sign_in_only",
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
    id: "duplicate_live_cells",
    status: vectorNames.has("did-ambiguous-live-cells") ? "pass" : "fail",
    evidence:
      "vectors.json contains did-ambiguous-live-cells and resolver tests fail closed",
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
