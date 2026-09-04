# Passport PoC Report

This report is updated as each implementation checkpoint is completed.

## Wallet-Mode Signing Convention

Local CCC inspection confirms the fallback CKB wallet convention for
`SignerSignType.CkbSecp256k1`: the signed payload is
`hashCkb(utf8("Nervos Message:" + message))`, and CCC private-key signing returns a 65-byte
recoverable secp256k1 signature. Passport's proof envelope keeps only raw `r||s` because the public
key is selected from the resolved DID document rather than recovered from the signature.

This has been verified with `SignerCkbPrivateKey` from `@ckb-ccc/core@1.19.1`. Live browser-wallet
behavior for JoyID, Neuron, or injected CCC signers has not yet been confirmed in this checkpoint;
that remains part of the browser proof-builder work.

The browser wallet proof builder is implemented against a generic `signMessageRaw(message)`
adapter. It accepts CCC-style 65-byte recoverable secp256k1 signatures or raw 64-byte signatures,
normalizes locally created signatures to low-S, and emits a `wallet` proof envelope with no
WebAuthn fields. This keeps wallet mode viable for local fixtures; live injected-wallet behavior
still needs confirmation.

## Resolver Query Status

The resolver wrapper decodes the `did:ckb` suffix through `@ckb-ccc/did-ckb`, builds the testnet
DID type script from CCC's `KnownScript.DidCkb`, and queries live cells directly. It intentionally
fetches up to two cells instead of using CCC's singleton helper, because the singleton helper returns
the first match and would hide ambiguity. Zero live cells fail as nonexistent or deactivated.
Multiple live cells fail closed in the PoC; WIP-01 earliest-genesis conflict resolution remains
full-project work.

Mocked resolver tests cover one, zero, duplicate, and malformed DID cases. A live testnet query is
available by setting `CKB_PASSPORT_LIVE_DID` to a known live testnet identifier.

## DID Document Decode Status

Document decoding uses `DidCkbData.decode` from `@ckb-ccc/did-ckb`, which handles the Molecule
union and DAG-CBOR document payload. The verifier validates the PoC document shape before later
verification-method selection: `verificationMethods` must be an object with string values,
`alsoKnownAs` must be an array of strings when present, and `services` must be an object when
present. DID documents containing `type`, `rotationKeys`, `prev`, or `sig` fail closed.

## DID Update Gate Status

The update gate now prepares a `transferDidCkb` transaction that adds or replaces
`verificationMethods["auth-1"]` with a generated P-256 `did:key:zDna...`. The wrapper first
resolves the DID with the PoC duplicate-cell guard, keeps the current DID cell lock as the receiver,
and signs only through a caller-provided DID lock signer. This confirms the code path does not use
the passkey as the DID cell lock and does not introduce a login transaction.

Live submission is available through `npm run update:did` after `npm run build`, but this checkout
does not contain a testnet DID, passkey `did:key`, or DID lock private key. Until those are supplied,
the transaction hash and capacity evidence remain unrecorded.

## DID Re-Resolve Round Trip Status

The re-resolve checker loads the DID from CKB testnet through the same duplicate-safe resolver,
decodes the DID document, reads `verificationMethods["auth-1"]`, and compares it byte-for-byte to
the expected passkey `did:key`. Local tests cover the matching case, missing key, mismatched key,
and zero-live-cell failure.

The live round trip has not been executed in this checkout because it requires the DID update
transaction from the previous step to be submitted and confirmed first.

## Passkey Assertion Builder Status

The browser helper now signs `SHA-256(canonicalMessage)` as the WebAuthn challenge, converts the
returned DER ECDSA signature to raw `r||s`, normalizes locally created P-256 signatures to low-S,
and returns a versioned `webauthn` proof envelope. The envelope intentionally contains the DID,
key ID, canonical message, signature, `clientDataJSON`, and `authenticatorData`; it contains no
wallet address, lock script, transaction skeleton, or spend signature.

## Verifier Message Checks Status

The verifier now parses the proof envelope and canonical SIWD message, compares the message domain
and URI origin to the configured relying-party origin, enforces version, network, DID, timestamp,
and nonce rules, and consumes the nonce before resolver or signature verification runs. Tests cover
wrong domain, wrong URI origin, expired messages, future `issuedAt`, replay, wrong network, bad
version, invalid DID syntax, and proof/message key mismatches.

## Verifier Resolver and Key Checks Status

The verifier now composes the duplicate-safe DID resolver, SDK-backed DID document decoder, and
verification method selector into a single resolver/key check. Tests cover successful P-256 key
selection, zero live cells, absent `keyId`, and unsupported `did:key` multicodec failure.

## Wallet Signature Verification Status

Wallet-mode verification now requires `proof.mode == "wallet"`, rejects WebAuthn-only fields,
requires a secp256k1 DID verification method, decodes the raw base64url signature, enforces low-S,
and verifies ECDSA over the CCC CKB personal-message hash. Tests cover valid signatures, tampered
messages, high-S rejection, wrong public keys, wrong proof mode, and wrong verification method
curve.

## WebAuthn Signature Verification Status

WebAuthn verification now requires a P-256 DID verification method, checks
`clientDataJSON.type == "webauthn.get"`, verifies origin and challenge binding, checks the
authenticator `rpIdHash`, requires the User Present bit, enforces low-S on the incoming raw
signature, and verifies ES256 over the full `authenticatorData || SHA-256(clientDataJSON)` payload.
Tests cover valid assertions, origin mismatch, challenge mismatch, User Present clear, wrong rpId
hash, wrong curve, tampered client data, tampered authenticator data, and high-S rejection.

## Session Issuing Status

The verifier package now includes an in-memory demo session service. A successful verification can
issue a random token whose server-side session stores only DID, key ID, issued time, and expiration
time. Tests verify expiry, clearing, token format, and the absence of address or lock-script fields.
