# Passport PoC

Testnet-only proof of concept for Sign-In with CKB DID.

This workspace intentionally starts as a scaffold. Protocol logic is added in small, auditable
increments that correspond to `../poc-implementation.md`.

## Commands

```powershell
npm install
npm test
npm run audit:scaffold
```

## Scope

- CKB testnet only.
- No mainnet writes.
- No fund movement.
- No production session stack.
- No CCC connector or relying-party integrations beyond the local demo.

