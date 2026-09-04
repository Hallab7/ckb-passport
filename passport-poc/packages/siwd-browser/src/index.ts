export {
  compressP256PublicKey,
  parseCoseP256PublicKey,
  passkeyAttestationToDidKey,
  PasskeyDidKeyError,
} from "./passkey-did-key.js";
export type { CoseP256PublicKey, PasskeyDidKeyResult } from "./passkey-did-key.js";
export {
  buildPasskeyCreationOptions,
  PasskeyRegistrationError,
  registerPasskey,
} from "./passkey-registration.js";
export type {
  BrowserCredentials,
  PasskeyRegistrationOptions,
  PasskeyRegistrationResult,
} from "./passkey-registration.js";
