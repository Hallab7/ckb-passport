# Passport PoC v2 Implementation Plan

This plan implements the v2 proof of concept in small phases. Each phase should end with a focused
audit, targeted validation, and a commit before moving to the next one.

## Phase 1 - Baseline Audit

Goal: confirm the repo state and v2 requirements before changing code.

Tasks:

- Read `PASSPORT.md`, `passport-poc.md`, and `passport-poc-new.md`.
- Confirm the active implementation root is `passport-poc/`.
- Record that v2 removes wallet login, keeps passkey login, adds software auth key fallback, adds
  proof-of-possession at registration, uses a conflict-safe resolver, and updates DID documents via
  `transferDidCkb`.
- Check `git status --short` before edits.

Audit:

- No source edits in this phase.
- Confirm no default DID is hardcoded into the UI.
- Confirm commit messages for this project do not use the forbidden word requested by the user.

## Phase 2 - Proof Contract

Goal: make the verifier accept only v2 proof modes.

Tasks:

- Change `SiwdProofMode` to `"webauthn" | "software"`.
- Replace wallet proof types with `SoftwareSiwdProofEnvelope`.
- Keep WebAuthn proof fields as top-level `clientDataJSON` and `authenticatorData`.
- Reject any proof mode outside `"webauthn"` and `"software"`.

Audit:

- Search for `mode: "wallet"` and wallet proof type exports.
- Build `@ckb-passport/siwd-verify`.

## Phase 3 - Software Signature Verification

Goal: verify software auth key proofs against DID document keys.

Tasks:

- Add `verifySoftwareSignature`.
- Decode base64url raw `r||s` signatures.
- Enforce exactly 64 bytes.
- Enforce low-S.
- Verify ECDSA over `SHA-256(canonicalMessage)`.
- Support `p256` and `secp256k1` decoded `did:key` curves.
- Reject WebAuthn-only fields in software proofs.

Audit:

- Add valid P-256 and secp256k1 software proof tests.
- Add tampered message, high-S, wrong mode, and forbidden WebAuthn field tests.

## Phase 4 - Remove Wallet Login

Goal: remove the unsafe v1 wallet login path.

Tasks:

- Remove wallet proof builder exports from `siwd-browser`.
- Remove wallet verifier exports from `siwd-verify`.
- Delete wallet-login implementation and tests.
- Keep controller-wallet DID update code separate from login.

Audit:

- Search source for wallet proof, wallet mode, and wallet sign-in references.
- Confirm remaining wallet references are only for DID controller/update operations.

## Phase 5 - Browser Software Auth Key

Goal: provide a no-wallet fallback for demos where passkeys are unavailable or blocked.

Tasks:

- Generate an extractable P-256 key pair through WebCrypto.
- Export the public key as raw uncompressed P-256.
- Compress it to 33 bytes.
- Encode it as `did:key:zDna...`.
- Store public/private JWK in IndexedDB under a DID/key-specific storage key.
- Load and clear the stored key.
- Sign canonical SIWD messages as `mode: "software"`.

Audit:

- Test generation, storage, signing, signature length, and clearing with an in-memory store.
- Build `@ckb-passport/siwd-browser`.

## Phase 6 - Conflict-Safe Resolver

Goal: ensure authentication never relies on a resolver that can silently choose one of multiple live
DID cells.

Tasks:

- Derive DID args with `didToArgs`.
- Load the DID type script through `client.getKnownScript(ccc.KnownScript.DidCkb)`.
- Query `findCellsByType` with an exact type script and limit at least 2.
- Reject zero live cells.
- Reject more than one live cell.
- Return the single live DID cell only when exactly one exists.

Audit:

- Unit test one live cell, zero live cells, duplicate live cells, and malformed DIDs.
- Confirm `verifySiwdProof` goes through this resolver.

## Phase 7 - DID Document Decode And Key Selection

Goal: read `verificationMethods` reliably from the DID Metadata Cell.

Tasks:

- Decode `DidCkbData` from cell output data.
- Normalize missing `verificationMethods` to `{}`.
- Require `verificationMethods` to be an object.
- Select the exact key ID from the message.
- Decode the selected `did:key`.
- Fail closed on missing keys and unsupported multicodecs.

Audit:

- Test empty methods, invalid method maps, missing key ID, valid P-256 key, and unsupported key.

## Phase 8 - SIWD Message And Nonce

Goal: bind every proof to the intended DID, key, relying party, network, and time window.

Tasks:

- Build canonical SIWD messages.
- Parse and reconstruct messages byte-for-byte.
- Validate domain, URI origin, version, network, DID syntax, nonce syntax, issued-at, and expiration.
- Issue single-use in-memory nonces.
- Consume the nonce before signature verification.

Audit:

- Test wrong domain, wrong URI origin, expired message, future issued-at, replay, wrong network, bad
  version, bad DID, and proof field mismatch.

## Phase 9 - WebAuthn Verification

Goal: verify passkey assertions against the P-256 DID verification method.

Tasks:

- Require `mode: "webauthn"`.
- Require decoded DID key curve `p256`.
- Decode raw signature, `clientDataJSON`, and `authenticatorData`.
- Require `clientDataJSON.type == "webauthn.get"`.
- Require `clientDataJSON.origin == expectedOrigin`.
- Require `clientDataJSON.challenge == base64url(SHA-256(message))`.
- Require authenticator `rpIdHash == SHA-256(rpId)`.
- Require User Present flag.
- Verify ES256 over `authenticatorData || SHA-256(clientDataJSON)`.

Audit:

- Test valid WebAuthn fixture plus origin, challenge, rpId, User Present, tampering, high-S, and
  wrong-curve failures.

## Phase 10 - Registration Proof Of Possession

Goal: never write an auth key that has not signed a fresh challenge.

Tasks:

- Add `/api/auth-key/proof-of-possession`.
- Require `did`, `keyId`, `didKey`, and `proof`.
- Verify the proof message checks against the configured origin and network.
- Require proof DID and key ID to match the target DID and key ID.
- Decode the proposed `did:key`.
- Verify WebAuthn or software signature against that proposed key.
- Return a named failure when PoP fails.

Audit:

- Confirm the UI calls this endpoint before DID update.
- Confirm failed PoP leaves no key ready for update.

## Phase 11 - DID Update

Goal: write the auth key into the DID document using the SDK-supported update path.

Tasks:

- Resolve the current DID cell first.
- Decode the current document.
- Upsert `verificationMethods[keyId] = didKey`.
- Use `transferDidCkb` with `receiver` set to the current lock.
- Complete fee calculation.
- Submit through the controller signer path.
- Keep this path separate from login.

Audit:

- Test document transformation, fee completion, submit failure handling, and round-trip helper.
- Confirm no update path is called during login verification.

## Phase 12 - Next.js Demo UI

Goal: make the whole demo executable from the browser UI.

Tasks:

- Keep the DID input empty by default.
- Disable DID resolve until DID input is present.
- Disable auth-key registration until the DID resolves.
- Offer passkey registration and software-key generation.
- Show generated fields as read-only.
- Connect the DID controller wallet only in the DID update section.
- Move round-trip checking to the explorer/evidence section.
- Keep nonce, sign-in, and replay controls in authentication.
- Reset session, inputs, result panels, proof state, and local software key state.
- Keep the UI single-column without the removed right sidebar or identity snapshot.

Audit:

- Build the Next.js app.
- Check mobile copy buttons stay compact and fields truncate long values.

## Phase 13 - Vectors

Goal: keep reusable proof fixtures aligned with v2.

Tasks:

- Replace wallet fixtures with software-key fixtures.
- Keep a WebAuthn positive fixture.
- Include wrong domain, wrong URI origin, expired message, future issued-at, replayed nonce, absent
  key ID, unsupported multicodec, high-S signature, WebAuthn origin mismatch, challenge mismatch,
  User Present clear, zero live cells, and duplicate live cells.

Audit:

- Run `npm test`.
- Confirm every vector matches its expected pass or named failure.

## Phase 14 - Evidence Scripts

Goal: keep command-line checks consistent with the UI and v2 acceptance criteria.

Tasks:

- Update acceptance checks to require the duplicate-live-cell vector.
- Document proof-of-possession as a local acceptance item.
- Update drill messages to request WebAuthn or software proof JSON.
- Keep explorer evidence pointed at Pudge testnet.

Audit:

- Run `npm run demo:check`, `npm run drill:check`, `npm run evidence:check`, and
  `npm run acceptance:check`.

## Phase 15 - Address And Spend-Authority Audit

Goal: prove login stores no address and needs no spend authority.

Tasks:

- Audit server login and session routes.
- Audit proof envelope types.
- Audit browser auth state.
- Confirm controller-wallet code is isolated to DID update.
- Confirm sessions store only DID, key ID, issued time, and expiration time.

Audit:

- Run `npm run audit:h4`.
- Update `ADDRESS-AUDIT.md`.

## Phase 16 - Documentation

Goal: make all docs describe the implemented v2 system.

Tasks:

- Update `passport-poc.md` from v2.
- Keep `passport-poc-new.md` aligned as the restored v2 source.
- Update README workspace, demo flow, software auth fallback, vectors, and limitations.
- Update `REPORT.md`, `ACCEPTANCE.md`, `RECORDING.md`, and `EXPLORER-EVIDENCE.md`.
- Remove stale wallet-login claims.

Audit:

- Search docs for stale wallet-mode language.
- Confirm remaining wallet references are only controller/update references or explain why wallet
  login was removed.

## Phase 17 - Full Validation

Goal: prove the checkout is internally consistent.

Tasks:

- Run `npm run build`.
- Run `npm test`.
- Run `git diff --check`.
- Run targeted text searches for forbidden stale proof modes.

Audit:

- Confirm no failing command is hidden.
- Record any skipped live tests as live-evidence gaps, not implementation passes.

## Phase 18 - Commit And Push

Goal: deliver the v2 implementation cleanly.

Tasks:

- Review `git diff --stat`.
- Review changed files for unrelated edits.
- Stage only the v2 implementation and doc alignment.
- Use a commit message that does not contain the forbidden word requested by the user.
- Push to `origin master`.

Audit:

- Confirm `git status --short --branch` after commit.
- Confirm push result.
