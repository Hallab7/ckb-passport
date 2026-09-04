# Final Acceptance

Status: local implementation accepted; H1 live read evidence captured; live acceptance incomplete.

Run:

```powershell
npm run acceptance:check
npm run acceptance:verify
```

Current result:

| Acceptance item | Status | Evidence |
|---|---|---|
| One documented command runs the demo | Pass | `npm run demo` starts the guided Next.js demo; `npm run demo:check` passes. |
| Supplied testnet DID resolves from live cells | Pass | `did:ckb:o5bfnlw5t75w5bgvillbz3jzdwa2lxng`; targeted live resolver test passes. |
| Passkey registration creates or updates a DID | Unresolved | Requires passkey `did:key` and DID lock signer for the supplied live DID. |
| `verificationMethods["auth-1"]` begins `did:key:zDna` on explorer | Unresolved | Requires update transaction hash and explorer evidence. |
| Sign-in works with platform authenticator only | Unresolved | Requires live browser recording after DID update. |
| Server session contains DID and no address | Pass | `npm run audit:h4` passes. |
| Replay of identical proof is rejected | Pass | `vectors.json` includes `replayed-nonce` expecting `nonce_consumed`. |
| `npm test` runs vectors | Pass | Vector runner tests are part of `npm test`. |
| Every vector matches expected pass/fail result | Pass | `npm test` passes locally. |
| `REPORT.md` states H1 through H4 outcomes | Pass | Final report is present. |

The unresolved items are update, explorer, sign-in, and recording evidence gaps, not hidden
implementation passes.
