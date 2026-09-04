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

