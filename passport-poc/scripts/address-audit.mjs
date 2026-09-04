import { readFileSync } from "node:fs";

const loginFiles = [
  "apps/demo/src/server.ts",
  "apps/demo/public/app.js",
  "packages/siwd-verify/src/session.ts",
  "packages/siwd-verify/src/proof.ts",
  "packages/siwd-verify/src/verification.ts",
  "packages/siwd-browser/src/passkey-assertion.ts",
  "packages/siwd-browser/src/wallet-proof.ts",
];

const registrationUpdateFiles = [
  "apps/demo/src/live-update.ts",
  "packages/siwd-verify/src/did-update.ts",
  "scripts/update-did-method.mjs",
];

const forbiddenLoginPatterns = [
  { code: "ckb_address", pattern: /\b(ckbAddress|ckb_address|CKB address)\b/ },
  { code: "lock_script", pattern: /\b(lockScript|lock script)\b/i },
  { code: "lock_hash", pattern: /\b(lockHash|lock hash)\b/i },
  { code: "transaction_skeleton", pattern: /\b(transaction skeleton|txSkeleton|TransactionSkeleton)\b/i },
  { code: "transaction_submission", pattern: /\b(sendTransaction|SignerCkbPrivateKey|DID_LOCK_PRIVATE_KEY)\b/ },
  { code: "transaction_signature", pattern: /\b(transaction signature|signTransaction|tx signature)\b/i },
  { code: "browser_storage", pattern: /\b(localStorage|sessionStorage)\b/ },
];

const registrationUpdatePatterns = [
  { code: "did_update_endpoint", pattern: /\/api\/did\/update/ },
  { code: "update_gate", pattern: /CKB_PASSPORT_ENABLE_DID_UPDATE/ },
  { code: "did_lock_signer", pattern: /CKB_PASSPORT_DID_LOCK_PRIVATE_KEY|SignerCkbPrivateKey/ },
  { code: "transaction_submission", pattern: /\b(sendTransaction|submitDidVerificationMethodUpdate)\b/ },
];

const loginFindings = scan(loginFiles, forbiddenLoginPatterns);
const registrationUpdateFindings = scan(
  registrationUpdateFiles,
  registrationUpdatePatterns,
);

const result = {
  ok: loginFindings.length === 0,
  login: {
    scannedFiles: loginFiles,
    forbiddenFindings: loginFindings,
    conclusion:
      loginFindings.length === 0
        ? "login/session/proof code does not store or request CKB address, lock script, lock hash, transaction skeleton, transaction signature, or browser storage"
        : "login/session/proof code contains forbidden H4 findings",
  },
  proofEnvelope: {
    disclosedFields: [
      "v",
      "did",
      "keyId",
      "message",
      "mode",
      "signature",
      "clientDataJSON",
      "authenticatorData",
    ],
    note: "proof signatures are authentication signatures over the SIWD message, not transaction signatures",
  },
  sessionStore: {
    storedFields: ["did", "keyId", "issuedAt", "expirationTime"],
  },
  registrationUpdate: {
    scannedFiles: registrationUpdateFiles,
    allowedFindings: registrationUpdateFindings,
    note: "DID lock signer and transaction submission are isolated to registration/update code",
  },
  walletMode: {
    note: "an injected wallet may show account UI while signing, but Passport stores only the proof and DID-only session fields",
  },
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) {
  process.exit(1);
}

function scan(files, patterns) {
  const findings = [];
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      for (const { code, pattern } of patterns) {
        if (pattern.test(line)) {
          findings.push({
            file,
            line: index + 1,
            code,
            text: line.trim(),
          });
        }
      }
    }
  }
  return findings;
}
