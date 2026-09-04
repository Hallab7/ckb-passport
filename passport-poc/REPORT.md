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
