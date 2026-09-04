export {
  ConfigError,
  getDidKnownScript,
  loadPassportPocConfig,
} from "./config.js";
export type {
  CkbHashType,
  ConfigEnv,
  PassportPocConfig,
  PassportPocNetwork,
} from "./config.js";
export { generateNonce, InMemoryNonceService } from "./nonce.js";
export type {
  NonceConsumeResult,
  NonceRecord,
  NonceServiceOptions,
} from "./nonce.js";
export { buildDidTypeScript, resolveDidCell } from "./resolver.js";
export type { DidCellResolution, ResolveDidCellOptions } from "./resolver.js";
export {
  decodeDidDocumentFromCell,
  validateDidCkbDocument,
} from "./document.js";
export type { DidCkbDocument, DidDocumentDecodeResult } from "./document.js";
export {
  prepareDidVerificationMethodUpdate,
  submitDidVerificationMethodUpdate,
  upsertP256VerificationMethod,
} from "./did-update.js";
export type {
  DidTransferFunction,
  DidVerificationMethodUpdateFailureCode,
  DidVerificationMethodUpdateResult,
  PreparedDidVerificationMethodUpdate,
  PrepareDidVerificationMethodUpdateOptions,
  SubmittedDidVerificationMethodUpdate,
  SubmitDidVerificationMethodUpdateOptions,
} from "./did-update.js";
export { selectVerificationMethod } from "./verification-method.js";
export type { VerificationMethodSelection } from "./verification-method.js";
export {
  hashCkbPersonalMessage,
  recoverableHexToRawSignatureHex,
  WALLET_RAW_SIGNATURE_HEX_LENGTH,
  WALLET_SIGNATURE_HEX_LENGTH,
  WALLET_SIGNING_CONVENTION,
  walletSigningConvention,
} from "./wallet-signing.js";
export type { WalletSigningConvention } from "./wallet-signing.js";
