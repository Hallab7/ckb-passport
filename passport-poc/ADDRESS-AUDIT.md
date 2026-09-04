# Address and Spend-Authority Audit

Status: local source audit passed.

Run:

```powershell
npm run audit:h4
```

Login path scanned:

| Area | Result |
|---|---|
| Server login and session routes | No CKB address, lock script, lock hash, transaction skeleton, transaction signature, or browser storage found. |
| Session store | Stores only DID, key ID, issued time, and expiration time. |
| Proof envelopes | Carry DID, key ID, message, mode, authentication signature, and WebAuthn data when applicable. |
| Browser demo state | Keeps nonce, message, credential ID, `did:key`, and last proof in memory only. |

Registration/update path:

| Area | Result |
|---|---|
| DID update route | Next.js route accepts the DID lock private key from the local UI or server env. |
| DID lock signer | Used only for writing the passkey `did:key` into the DID document. |
| Transaction submission | Isolated to registration/update code, not login. |

Wallet-mode note: an injected wallet can display its own account UI while signing. Passport does
not persist a wallet address in the proof envelope or server session.
