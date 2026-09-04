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
export {
  hashCkbPersonalMessage,
  recoverableHexToRawSignatureHex,
  WALLET_RAW_SIGNATURE_HEX_LENGTH,
  WALLET_SIGNATURE_HEX_LENGTH,
  WALLET_SIGNING_CONVENTION,
  walletSigningConvention,
} from "./wallet-signing.js";
export type { WalletSigningConvention } from "./wallet-signing.js";

