const COMMON_STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "là", "và", "hoặc", "của", "trong", "cho", "trên", "với", "tại", "bởi", "từ", "hãy", "giúp"
]);

export function normalizePromptText(value) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}_\-./\\]+/gu, " ")
    .trim();
}

export function tokenizeAndClean(text) {
  if (typeof text !== "string") return [];
  const normalized = normalizePromptText(text);
  return normalized
    .split(/\s+/)
    .filter((token) => token.length > 1 && !COMMON_STOP_WORDS.has(token));
}
