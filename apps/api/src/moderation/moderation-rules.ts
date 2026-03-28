export const builtInBlacklistKeywords = [
  'airdrop',
  'claim now',
  'guaranteed profit',
  'double your',
  'pump signal',
  'free usdt',
  'wallet connect',
  'seed phrase',
  'crypto_bot',
];

export const builtInRiskyDomains = [
  'bit.ly',
  'tinyurl.com',
  't.me/+',
  'grabify',
  'claim-bonus',
  'airdrop',
];

export const suspiciousUsernamePattern =
  /(seed|bonus|profit|airdrop|support|admin)/i;

export const socialEngineeringPattern = /(wallet|verify|connect|gift|promo)/i;

export const moderationDecisionThresholds = {
  ban: 90,
  restrict: 75,
  warn: 60,
  review: 40,
};

export function normalizeRuleValue(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

export function uniqueNormalizedValues(values: string[]) {
  return Array.from(
    new Set(values.map((value) => normalizeRuleValue(value)).filter(Boolean)),
  );
}
