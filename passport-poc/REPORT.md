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

