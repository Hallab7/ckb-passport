# Passport PoC Implementation Plan

Source documents:
- `PASSPORT.md` describes the full 12-week Passport project.
- `passport-poc.md` defines the two-week proof of concept.

This plan implements only the proof of concept. It is intentionally split into small phases so each
phase has one clear purpose, one clear output, and a concrete check before moving on.

## PoC Objective

Build a testnet-only Sign-In with CKB DID proof of concept that can confirm or falsify these four
hypotheses:

| ID | Hypothesis | PoC result needed |
|---|---|---|
| H1 | A `did:ckb` document can be resolved from a CKB node and its `verificationMethods` read reliably. | Resolver returns a live DID document and named verification methods from testnet. |
| H2 | A signature by a `verificationMethod` key verifies against the resolved document. | Wallet or passkey proof verifies against the key stored in the DID document. |
| H3 | A WebAuthn passkey can be registered as a `verificationMethod` and its assertion verified. | Passkey public key becomes a `did:key:zDna...`, is written into the DID document, round-trips, and verifies an assertion. |
| H4 | The full login round trip authenticates with no address disclosed and no spend authority. | Session contains DID and key ID only; no address or lock-script signature is needed during login. |

If H3 fails, the PoC is still complete if the failure is isolated, documented, and the wallet-mode
fallback path is evaluated.

## Scope Guardrails

Do not implement these in the PoC:

- Key rotation semantics, revocation propagation, recovery, or production deactivation workflows.
- CCC connector.
- Discourse plugin.
- Second relying party.
- Persistent nonce database.
- Production-grade sessions.
- Multiple verification methods beyond selecting one explicit `keyId`.
- Delegation, claims, credentials, or selective disclosure.
- Mainnet writes or any fund movement.
- UI polish beyond a usable demo flow.

The only deactivation behavior in scope is verifier fail-closed behavior when zero live DID cells
are returned.

## Target Artifact Layout

Create this layout during implementation:

```text
passport-poc/
  package.json
  tsconfig.base.json
  README.md
  REPORT.md
  docker-compose.yml
  .env.example
  packages/
    siwd-core/
      package.json
      src/
      test/
    siwd-verify/
      package.json
      src/
      test/
    siwd-browser/
      package.json
      src/
      test/
  apps/
    demo/
      package.json
      src/
      public/
      test/
  vectors/
    vectors.json
```

Use TypeScript and Node for the reference implementation unless the actual SDK constraints force a
different choice. Keep the packages small and dependency choices explicit in the README.

## Phase 1 - Workspace Scaffold

Goal: create the PoC workspace without implementing protocol behavior yet.

Build:
- Create `passport-poc/`.
- Add npm workspace configuration for `packages/*` and `apps/*`.
- Add root scripts for `build`, `test`, `lint` if used, and `demo`.
- Add shared TypeScript config.
- Add `.env.example` with placeholders for CKB testnet RPC/indexer values and DID type-script
  settings if the SDK does not expose them automatically.

Done when:
- `npm install` completes.
- `npm test` runs, even if it only executes placeholder tests.
- No package contains real protocol logic yet.

## Phase 2 - Dependency and SDK Check

Goal: verify the actual APIs available from `@ckb-ccc/did-ckb`.

Build:
- Install the current `@ckb-ccc/did-ckb` package.
- Add a short SDK probe script under `passport-poc/scripts/` or `packages/siwd-verify/test/`.
- Check whether the SDK exposes:
  - testnet DID type script code hash;
  - testnet DID hash type;
  - document resolution;
  - raw DID Metadata Cell data;
  - document update for `verificationMethods`;
  - encoding or decoding helpers for DID documents.

Done when:
- README notes the exact package version tested.
- README records which SDK APIs are usable directly.
- Any missing API is mapped to a local implementation task in later phases.

## Phase 3 - Testnet DID Deployment Settings

Goal: answer where the DID type script is deployed on testnet.

Build:
- Retrieve `DID_CODE_HASH` and `DID_HASH_TYPE` from the SDK if available.
- If unavailable, find the SDK's config source and document the values.
- Add typed config loading for:
  - network: `ckb-testnet`;
  - CKB RPC URL;
  - indexer URL if separate;
  - DID code hash;
  - DID hash type.

Done when:
- A config test proves testnet config loads.
- README records the source of the DID deployment settings.
- No hardcoded deployment value exists without a comment explaining its source.

## Phase 4 - Wallet Signing Convention Spike

Goal: answer the wallet-mode open question early.

Build:
- Test what JoyID, Neuron, CCC signer, or the available local wallet interface signs for a personal
  message.
- Determine whether wallet mode should verify:
  - `SHA-256(message)`;
  - a CKB-prefixed personal message;
  - a CCC-specific signing payload;
  - another documented payload.
- Record exact bytes that are signed and exact signature encoding returned.

Done when:
- `REPORT.md` has a draft note for the wallet-mode signing convention.
- `siwd-verify` has a TODO or test fixture for the selected wallet payload.
- If no wallet signs verifiably, H2 depends on passkey mode and this is stated plainly.

## Phase 5 - SIWD Message Builder

Goal: implement canonical SIWD message creation in `siwd-core`.

Build:
- Add a `SiwdMessageFields` type with:
  - `domain`;
  - `did`;
  - `statement`;
  - `keyId`;
  - `uri`;
  - `version`;
  - `network`;
  - `nonce`;
  - `issuedAt`;
  - `expirationTime`.
- Add `buildSiwdMessage(fields)` that produces exactly:

```text
${domain} wants you to sign in with your CKB DID:
${did}

${statement}

Key ID: ${keyId}
URI: ${uri}
Version: 1
Network: ${network}
Nonce: ${nonce}
Issued At: ${issuedAt}
Expiration Time: ${expirationTime}
```

Done when:
- Unit tests verify byte-for-byte output.
- Tests include a normal testnet message and a message with a localhost domain.

## Phase 6 - SIWD Message Parser

Goal: parse canonical SIWD messages without accepting ambiguous forms.

Build:
- Add `parseSiwdMessage(message)`.
- Reject missing fields.
- Reject duplicated fields.
- Reject extra unknown fields.
- Reject reordered fields.
- Reject a statement with a newline.
- Reject a statement beginning with `-`.
- Return a typed parsed object only on exact canonical form.

Done when:
- Parser tests cover valid output from the builder.
- Negative parser tests cover missing, duplicated, reordered, and malformed fields.

## Phase 7 - SIWD Field Validation

Goal: implement field rules separately from signature verification.

Build:
- Validate `domain` as the RFC 3986 authority of the relying party.
- Validate `did` with `^did:ckb:[a-z2-7]{32}$`.
- Validate `uri` as absolute.
- Validate URI origin against expected origin.
- Validate `Version` is literal `1`.
- Validate `network` is `ckb-testnet` or `ckb-mainnet`.
- Validate nonce is at least 8 alphanumeric characters.
- Validate timestamps are RFC 3339 UTC values with `Z`.
- Validate `Expiration Time - Issued At` is not more than 5 minutes unless explicitly configured for
  a test case.

Done when:
- `siwd-core` exports a validation result with named failure reasons.
- Unit tests cover every field rule.

## Phase 8 - Byte and Encoding Utilities

Goal: add the small shared utilities needed by all later phases.

Build:
- Base64url encode/decode with no padding requirement.
- SHA-256 helper returning bytes.
- Constant-time byte comparison where practical.
- Hex conversion helpers for tests.
- ECDSA raw signature shape checks for 64-byte `r||s`.

Done when:
- Utility tests cover valid and invalid base64url.
- Raw signature tests reject non-64-byte values.

## Phase 9 - `did:key` Codec

Goal: support exactly the two curves allowed by the PoC.

Build:
- Decode `did:key:z...` values.
- Base58btc-decode the key body.
- Read the varint multicodec prefix.
- Accept only:
  - `e7 01` for secp256k1;
  - `80 24` for P-256.
- Require exactly 33 compressed public-key bytes.
- Reject trailing bytes.
- Encode compressed secp256k1 and P-256 keys back to `did:key`.

Done when:
- Tests confirm the expected prefixes:
  - secp256k1 begins `did:key:zQ3s`;
  - P-256 begins `did:key:zDna`.
- Tests prove unsupported multicodec values fail closed.
- Tests prove trailing bytes fail closed.

## Phase 10 - Low-S Signature Policy

Goal: enforce the PoC rule that high-S signatures must fail.

Build:
- Add low-S checks for secp256k1.
- Add low-S checks for P-256.
- Normalize signatures only when creating proofs locally.
- Reject high-S signatures during verification.

Done when:
- Unit tests include one low-S and one high-S fixture for each curve.
- Verifier tests never silently normalize incoming proofs.

## Phase 11 - Nonce Service

Goal: implement replay protection with an in-memory nonce store.

Build:
- Add nonce issue endpoint/helper.
- Store nonce, issued time, expiration time, and consumed state in memory.
- Mark a nonce consumed before signature verification completes, or guard the consume operation so
  concurrent replays cannot both pass.
- Return named failures for unknown, expired, and already consumed nonce.

Done when:
- Tests prove first use succeeds and second use fails.
- Tests prove expired nonce fails.
- No database is introduced.

## Phase 12 - Resolver Query

Goal: implement the H1 live-cell lookup.

Build:
- Base32-decode the 32-character DID suffix to 20 bytes.
- Query live cells where type script equals:
  - configured DID code hash;
  - configured DID hash type;
  - decoded DID args.
- Treat zero live cells as failure.
- Treat more than one live cell as fail-closed for the PoC and log the ambiguity.
- Keep WIP-01 earliest-genesis conflict resolution documented as full-project work.

Done when:
- A resolver integration test can query testnet for a known DID.
- Zero-cell resolution has a named failure.
- Duplicate-cell resolution is not picked arbitrarily.

## Phase 13 - DID Document Decode

Goal: extract JSON metadata from the DID Metadata Cell.

Build:
- Use SDK document-resolution APIs if Phase 2 proves they work.
- If not, decode cell data as:
  - Molecule `DidCkbData`;
  - `document`;
  - DAG-CBOR;
  - JSON metadata.
- Validate the document shape:
  - `verificationMethods` exists and is an object;
  - values are strings;
  - `alsoKnownAs` is optional;
  - `services` is optional.
- Reject DID documents containing `type`, `rotationKeys`, `prev`, or `sig`.

Done when:
- H1 has a passing test against a real or recorded testnet DID.
- A malformed document fixture fails closed.
- The README states whether SDK decode or local decode is used.

## Phase 14 - Verification Method Selection

Goal: select the exact key named in the SIWD message.

Build:
- Look up `doc.verificationMethods[message.keyId]`.
- Reject absent `keyId`.
- Reject a present value that is not a supported `did:key`.
- Return the decoded curve and compressed public key.

Done when:
- Tests cover a present P-256 key.
- Tests cover a present secp256k1 key.
- Tests cover missing `keyId`.
- Tests cover unsupported key encoding.

## Phase 15 - Passkey Registration UI

Goal: create a browser flow that produces a P-256 credential.

Build:
- In `siwd-browser`, add `registerPasskey(options)`.
- Call `navigator.credentials.create` with:
  - `pubKeyCredParams: [{ type: "public-key", alg: -7 }]`;
  - relying-party ID;
  - user handle;
  - `residentKey: "preferred"`;
  - `userVerification: "preferred"`.
- Return the credential ID, raw attestation object, and client data.
- Surface browser errors with readable failure names.

Done when:
- The demo page can trigger platform passkey registration over a valid HTTPS or localhost origin.
- Non-P-256 registration is not accepted by the next phase.

## Phase 16 - Passkey COSE to `did:key`

Goal: convert the registered passkey public key into `did:key:zDna...`.

Build:
- Parse attestation object CBOR.
- Extract `authData`.
- Extract attested credential data.
- Extract the COSE public key.
- Assert:
  - `kty(1) == 2`;
  - `alg(3) == -7`;
  - `crv(-1) == 1`.
- Read `x = COSE[-2]` and `y = COSE[-3]`.
- Compress the point as `(y[31] & 1 ? 0x03 : 0x02) || x`.
- Encode as `did:key:z` plus base58btc of `0x80 0x24 || compressed`.

Done when:
- A real browser-created credential produces a `did:key:zDna...` value.
- Tests reject wrong algorithm, wrong curve, missing coordinate, and malformed CBOR.

## Phase 17 - DID Document Update Gate

Goal: answer the H3 gate: can the passkey `did:key` be written into `verificationMethods`.

Build:
- Use the DID cell lock key only for this registration/update operation.
- Add or replace `verificationMethods["auth-1"]` with the generated P-256 `did:key`.
- Submit the update on CKB testnet.
- Record the transaction hash and any capacity required.

Done when:
- The SDK accepts the arbitrary P-256 `did:key`, or the exact rejection is captured.
- The step does not use the passkey as the DID cell lock.
- The login flow still has no transaction.

## Phase 18 - DID Re-Resolve Round Trip

Goal: prove the written verification method survives on-chain storage and resolution.

Build:
- Re-resolve the DID after the update transaction is confirmed.
- Read `verificationMethods["auth-1"]`.
- Compare it byte-for-byte against the generated `did:key`.
- Record the result as the H3 registration outcome.

Done when:
- A byte-identical round trip marks H3 registration as passed.
- Any mismatch or SDK rejection marks H3 registration as failed with exact evidence.

## Phase 19 - Passkey Assertion Builder

Goal: sign a SIWD message with the registered passkey.

Build:
- Compute `SHA-256(canonicalMessage)`.
- Pass that hash as the WebAuthn challenge.
- Call `navigator.credentials.get`.
- Return a proof envelope with:
  - `v: 1`;
  - `did`;
  - `keyId`;
  - `message`;
  - `mode: "webauthn"`;
  - raw `r||s` signature as base64url;
  - `clientDataJSON` as base64url;
  - `authenticatorData` as base64url.
- Convert DER ECDSA signatures from WebAuthn into raw `r||s`.
- Normalize locally created proof signatures to low-S if the WebAuthn output requires it and this
  can be done without breaking verification semantics.

Done when:
- The browser creates a complete WebAuthn proof envelope.
- The envelope contains no wallet address.
- Signature conversion has unit tests.

## Phase 20 - Wallet Proof Builder

Goal: create a fallback proof if wallet mode is viable.

Build:
- Use the wallet signing convention selected in Phase 4.
- Build a proof envelope with:
  - `v: 1`;
  - `did`;
  - `keyId`;
  - `message`;
  - `mode: "wallet"`;
  - raw low-S `r||s` signature as base64url.
- Do not include `webauthn` fields in wallet mode.

Done when:
- At least one wallet-mode proof can be generated, or the failure is recorded.
- Wallet mode does not require a transaction.
- Any address exposed by wallet tooling is documented as an H4 concern.

## Phase 21 - Verifier Message Checks

Goal: implement verification algorithm steps 1 through 8.

Build:
- Parse `proof.message`.
- Compare `message.domain` to `host(expectedOrigin)`.
- Compare `origin(message.uri)` to `expectedOrigin`.
- Check version, network, timestamps, nonce, and DID syntax.
- Consume nonce exactly once.
- Return named failure codes for every rejection.

Done when:
- Tests cover wrong domain, wrong URI origin, expired, future `issuedAt`, replayed nonce, wrong
  network, bad version, and invalid DID.

## Phase 22 - Verifier Resolver and Key Checks

Goal: implement verification algorithm steps 9 through 11.

Build:
- Resolve the DID.
- Fail closed on zero live cells.
- Fail closed on duplicate live cells in the PoC.
- Decode the DID document.
- Select the requested verification method.
- Decode the `did:key`.

Done when:
- Tests cover successful key selection.
- Tests cover zero live cells.
- Tests cover absent `keyId`.
- Tests cover unsupported multicodec.

## Phase 23 - Wallet Signature Verification

Goal: implement verification algorithm step 12 for wallet mode.

Build:
- Require `proof.mode == "wallet"`.
- Reject if `proof.webauthn` is present.
- Reconstruct the selected signed payload.
- Verify ECDSA over the decoded curve.
- Enforce low-S on the incoming raw signature.

Done when:
- Valid wallet proof passes if wallet mode is viable.
- Tampered message fails.
- High-S wallet signature fails.
- Wrong public key fails.

## Phase 24 - WebAuthn Signature Verification

Goal: implement verification algorithm step 12 for passkey mode.

Build:
- Require the selected verification method curve to be P-256.
- Decode `clientDataJSON`.
- Check `clientDataJSON.type == "webauthn.get"`.
- Check `clientDataJSON.origin == expectedOrigin`.
- Check `base64url_decode(clientDataJSON.challenge) == SHA-256(message)`.
- Check `authenticatorData[0..32] == SHA-256(rpId)`.
- Check the User Present bit is set.
- Verify P-256 ECDSA over `authenticatorData || SHA-256(clientDataJSON)`.
- Enforce low-S on the incoming raw signature.

Done when:
- Valid WebAuthn proof passes.
- Tests cover origin mismatch, challenge mismatch, User Present bit clear, wrong rpId hash, wrong
  curve, tampered client data, and tampered authenticator data.

## Phase 25 - Session Issuing

Goal: complete verification algorithm step 13 without adding production session complexity.

Build:
- Issue a signed cookie or in-memory demo session after verification passes.
- Bind session to:
  - DID;
  - key ID;
  - issued time;
  - expiration time.
- Store no wallet address.
- Store no lock script.
- Store no raw private key or passkey secret.

Done when:
- Demo server can show current session contents.
- Session contents include DID and key ID only.
- H4 has evidence that login did not disclose an address.

## Phase 26 - Test Vector Schema

Goal: create the reusable `vectors.json` artifact.

Build:
- Define each vector as:

```json
{
  "name": "example",
  "proof": {},
  "expectedOrigin": "http://localhost:3000",
  "network": "ckb-testnet",
  "expect": "pass",
  "reason": "human-readable reason"
}
```

- Add a vector runner in `siwd-verify`.
- Allow resolver fixtures or recorded documents for deterministic vector tests.

Done when:
- `npm test` runs the vector runner.
- A valid positive wallet vector exists if wallet mode is viable.
- A valid positive WebAuthn vector exists if H3 passes.

## Phase 27 - Required Negative Vectors

Goal: include every negative vector required by the PoC spec.

Build vectors for:
- Wrong domain.
- Wrong URI origin.
- Expired message.
- `issuedAt` in the future.
- Replayed nonce.
- `keyId` absent from document.
- Unsupported multicodec.
- High-S signature.
- WebAuthn `clientData.origin` mismatch.
- WebAuthn challenge not equal to `SHA-256(message)`.
- WebAuthn User Present bit clear.
- DID resolves to zero live cells.

Done when:
- Each required negative vector has a named expected failure reason.
- The vector runner verifies every expected failure.
- No negative vector passes by failing earlier for an unrelated reason unless that reason is the
  point of the vector.

## Phase 28 - Demo Server

Goal: build the minimal relying-party app.

Build:
- Add Express demo app.
- Add endpoint to issue a nonce.
- Add endpoint to receive a proof and verify it.
- Add endpoint to show current session.
- Add endpoint to clear session.
- Use configured `expectedOrigin` and `ckb-testnet`.

Done when:
- The demo can run locally.
- A failed proof returns the named failing step.
- A successful proof creates a visible session.

## Phase 29 - Demo Browser Page

Goal: make one usable HTML page for the PoC flow.

Build:
- Show controls for:
  - entering DID;
  - entering key ID;
  - requesting a nonce;
  - registering a passkey;
  - writing passkey `did:key` to the DID document;
  - signing in with passkey;
  - signing in with wallet mode if available;
  - replaying the last proof;
  - viewing session contents.
- Keep UI simple. No production styling.
- Never display or request a spend transaction during login.

Done when:
- A tester can complete the flow without reading source code.
- The replay button demonstrates nonce rejection.
- The session panel shows no address.

## Phase 30 - Docker or One-Command Run

Goal: satisfy the acceptance criterion for simple startup.

Build:
- Add `docker-compose.yml` if the app needs containerized services.
- Otherwise add one documented command such as `npm run demo`.
- Include required environment variables in `.env.example`.
- Document testnet RPC/indexer requirements.

Done when:
- A fresh checkout can run the demo with one documented command after installing dependencies.
- README explains when Docker is unnecessary.

## Phase 31 - End-to-End Testnet Drill

Goal: run the actual PoC flow against CKB testnet.

Build:
- Start the demo.
- Register a passkey.
- Convert it to `did:key:zDna...`.
- Update `verificationMethods["auth-1"]`.
- Re-resolve the DID.
- Sign in with Face ID or Touch ID only.
- Verify the server session contains DID and key ID only.
- Replay the identical proof.

Done when:
- H1 has live testnet evidence.
- H3 has pass or fail evidence.
- H4 has address-free login evidence.
- Replay is rejected with the failing step named.

## Phase 32 - Explorer Evidence

Goal: capture evidence that the registered verification method exists on-chain.

Build:
- Record DID.
- Record update transaction hash.
- Record explorer link if available.
- Record the visible `verificationMethods["auth-1"]` value beginning `zDna`.
- Record actual DID cell capacity cost if registration or update exposes it.

Done when:
- README or REPORT includes the evidence.
- The capacity note is clear enough to inform the full project's sponsorship question.

## Phase 33 - Address and Spend-Authority Audit

Goal: explicitly validate H4 rather than assuming it.

Build:
- Search server logs, session objects, proof envelopes, browser storage, and demo state for:
  - CKB address;
  - lock script;
  - lock hash;
  - transaction skeleton;
  - transaction signature.
- Separate registration/update evidence from login evidence.
- State whether wallet tooling exposes an address even if Passport does not store it.

Done when:
- `REPORT.md` states exactly what was and was not disclosed.
- Any H4 limitation is described plainly.

## Phase 34 - README

Goal: document how to run and evaluate the PoC.

Build:
- Explain scope and non-goals.
- List prerequisites.
- List environment variables.
- Give install, test, and demo commands.
- State DID testnet deployment settings and their source.
- Explain passkey registration and login flow.
- Explain wallet-mode status.
- Link to `vectors/vectors.json`.

Done when:
- A new developer can run tests and the demo from the README.
- The README does not imply production readiness.

## Phase 35 - REPORT

Goal: write the final PoC result.

Build:
- One paragraph for H1: resolver outcome.
- One paragraph for H2: signature verification outcome.
- One paragraph for H3: passkey registration and assertion outcome.
- One paragraph for H4: address-free, no-spend-authority outcome.
- If H3 failed, put that first and state the exact blocking step.
- Include wallet signing convention findings.
- Include resolver trust limitations.
- Include conflict-resolution observations.
- Include capacity findings.
- State what the result means for the full 12-week project.

Done when:
- `REPORT.md` answers all four hypotheses.
- It distinguishes implemented behavior from unresolved future work.

## Phase 36 - Recording

Goal: produce the evidence expected by the PoC spec.

Build:
- Record the end-to-end demo.
- Show passkey registration or the exact H3 failure.
- Show sign-in without wallet transaction.
- Show session contents.
- Show replay rejection.
- Show tests passing.

Done when:
- README or REPORT points to the recording location.
- The recording proves the acceptance criteria without requiring code review.

## Phase 37 - Final Acceptance Pass

Goal: verify the complete PoC against the original acceptance criteria.

Check:
- `docker compose up` or one documented command runs the demo against CKB testnet.
- Passkey registration creates or updates a DID when H3 passes.
- `verificationMethods["auth-1"]` begins `zDna` when H3 passes.
- Sign-in works with Face ID or Touch ID only when H3 passes.
- Wallet-mode fallback is documented if H3 fails.
- Server session store contains DID and no address.
- Replay of the identical proof is rejected.
- `npm test` runs `vectors.json`.
- Every vector matches its expected pass or fail result.
- `REPORT.md` states H1 through H4 outcomes.

Done when:
- Every checked item is passing or explicitly marked as a falsified hypothesis.
- No out-of-scope full-project feature has been added.

## Implementation Order Summary

Recommended order:

1. Scaffold workspace.
2. Confirm SDK and testnet deployment details.
3. Resolve wallet signing convention.
4. Build `siwd-core`.
5. Build encoding and crypto utilities.
6. Build resolver and DID document reader.
7. Attempt passkey registration and DID document update.
8. Build proof builders.
9. Build verifier.
10. Build vectors.
11. Build demo.
12. Run end-to-end drill.
13. Write README, REPORT, and recording notes.

This order answers the riskiest questions early while keeping each implementation phase small.
