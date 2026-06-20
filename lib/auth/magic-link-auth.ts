export {
  MAGIC_LINK_RESEND_COOLDOWN_MS,
  normalizeAuthEmail,
  isValidAuthEmail,
  formatLinkSentBody,
  formatExistingLinkBody,
  formatResendCooldownMessage,
  isMagicLinkRateLimitError,
  resolveMagicLinkSendOutcome,
  canResendMagicLink,
  getMagicLinkResendDelayMs,
  formatMagicLinkError,
} from "./magic-link-auth.mjs";
