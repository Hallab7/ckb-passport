# Recording

Status: not captured in this checkout.

Expected artifact:

```text
evidence/passport-poc-recording.mp4
```

Override path:

```powershell
$env:CKB_PASSPORT_RECORDING="C:\path\to\passport-poc-recording.mp4"
npm run recording:verify
```

Required scenes:

| Scene | Current status |
|---|---|
| Tests passing | Available from local command output, not recorded. |
| Passkey registration or exact H3 failure | Not recorded. |
| DID update or exact update blocker | Not recorded. |
| Session contents after sign-in | Not recorded. |
| Identical proof replay rejected | Covered by local vectors and drill harness, not recorded live. |

Current blocker: no live testnet DID, passkey `did:key`, DID lock private key, update transaction
hash, captured live proof file, or usable local browser recording surface is available in this
checkout.
