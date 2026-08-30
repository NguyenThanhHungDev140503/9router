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
  // Split on whitespace and punctuation like _ - . /
  const tokens = [];
  for (const part of normalized.split(/\s+/)) {
    if (!part) continue;
    if (part.length > 1 && !COMMON_STOP_WORDS.has(part)) {
      tokens.push(part);
    }
    // Also include sub-tokens when delimited by _ - .
    const subParts = part.split(/[_\-./\\]+/).filter((p) => p.length > 1 && !COMMON_STOP_WORDS.has(p));
    if (subParts.length > 1) {
      tokens.push(...subParts);
    }
  }
  return [...new Set(tokens)];
}
