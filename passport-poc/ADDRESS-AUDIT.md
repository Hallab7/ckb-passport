# Address and Spend-Authority Audit

Status: local source audit passed.

Run:

```powershell
npm run audit:h4
```

Login path scanned:

| Area | Result |
|---|---|
| Server login and session routes | No CKB address, lock script, lock hash, transaction skeleton, or transaction signature found. |
| Session store | Stores only DID, key ID, issued time, and expiration time. |
| Proof envelopes | Carry DID, key ID, message, mode, authentication signature, and WebAuthn data when applicable. |
| Browser demo state | Keeps nonce, message, credential ID, `did:key`, and last proof in memory; software auth private JWK is stored in IndexedDB only for the lower-assurance fallback. |

Registration/update path:

| Area | Result |
|---|---|
| DID update routes | Next.js exposes a browser-controller EVM flow plus an optional server signer route for local scripts. |
| DID lock signer | Used only for writing the auth `did:key` into the DID document. |
| Transaction submission | Isolated to registration/update code, not login. |

Controller-wallet note: an injected wallet can display its own account UI while authorising the DID
update. Passport does not persist that account in the proof envelope or server session, and wallet
signing is not a login mode.
