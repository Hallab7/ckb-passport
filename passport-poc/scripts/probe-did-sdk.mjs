import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import * as didCkbSdk from "@ckb-ccc/did-ckb";
import { ccc } from "@ckb-ccc/core";

const require = createRequire(import.meta.url);
const packageJsonPath = require.resolve("@ckb-ccc/did-ckb/package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

const expectedExports = [
  "argsToDid",
  "createDidCkb",
  "destroyDidCkb",
  "DidCkbData",
  "didToArgs",
  "findDidCkbCell",
  "isDidCkb",
  "resolveDidCkb",
  "transferDidCkb"
];

const missingExports = expectedExports.filter((name) => typeof didCkbSdk[name] === "undefined");

const testnetClient = new ccc.ClientPublicTestnet({
  url: process.env.CKB_RPC_URL || "https://testnet.ckb.dev/"
});
const didScriptInfo = await testnetClient.getKnownScript(ccc.KnownScript.DidCkb);

const sampleArgs = `0x${"11".repeat(20)}`;
const sampleDid = didCkbSdk.argsToDid(sampleArgs);
const roundTripArgs = didCkbSdk.didToArgs(sampleDid);

const sampleDocument = {
  verificationMethods: {
    "auth-1": "did:key:zDnaeWhtsampleplaceholder"
  },
  alsoKnownAs: ["at://alice.test"],
  services: {}
};
const encoded = didCkbSdk.DidCkbData.encode(
  didCkbSdk.DidCkbData.fromV1({ document: sampleDocument })
);
const decoded = didCkbSdk.DidCkbData.decode(encoded);
let documentCodec = true;
try {
  assert.deepStrictEqual(decoded.value.document, sampleDocument);
} catch {
  documentCodec = false;
}

const report = {
  package: {
    name: packageJson.name,
    version: packageJson.version
  },
  missingExports,
  didTypeScript: {
    source: "ccc.ClientPublicTestnet.getKnownScript(ccc.KnownScript.DidCkb)",
    codeHash: didScriptInfo.codeHash,
    hashType: didScriptInfo.hashType,
    cellDeps: didScriptInfo.cellDeps?.length ?? 0
  },
  capabilities: {
    identifierCodec: sampleArgs.toLowerCase() === roundTripArgs.toLowerCase(),
    documentCodec,
    documentResolution: typeof didCkbSdk.resolveDidCkb === "function",
    liveCellLookup: typeof didCkbSdk.findDidCkbCell === "function",
    rawDidCellReturn: typeof didCkbSdk.findDidCkbCell === "function",
    documentCreate: typeof didCkbSdk.createDidCkb === "function",
    documentTransferUpdate: typeof didCkbSdk.transferDidCkb === "function",
    targetedVerificationMethodUpdate: false
  },
  notes: [
    "resolveDidCkb returns the live DID record when given a CCC client and did:ckb string.",
    "findDidCkbCell returns the live DID Metadata Cell and decoded DidCkbData for 20-byte args.",
    "DidCkbData encodes Molecule data and DAG-CBOR document content.",
    "No targeted helper for verificationMethods was found; update code must transform the document and pass it through transferDidCkb."
  ]
};

console.log(JSON.stringify(report, null, 2));

if (missingExports.length > 0) {
  process.exitCode = 1;
}
