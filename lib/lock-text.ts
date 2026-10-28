// Fingerprint used to lock a material. Punctuation and extra space do not make a new one.
export function normalizeForLock(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function lockHashSource(text: string) {
  return normalizeForLock(text).replace(/ /g, "");
}

export function isNearDuplicate(leftText: string, rightText: string, threshold: number) {
  const left = words(leftText);
  const right = words(rightText);
  if (left.length === 0 || right.length === 0) return false;

  const intersection = sharedWordCount(left, right);
  const dice = (2 * intersection) / (left.length + right.length);
  if (dice >= threshold) return true;

  // A single inserted, deleted, or replaced word on a real passage.
  const shorter = Math.min(left.length, right.length);
  const longer = Math.max(left.length, right.length);
  if (shorter < 8) return false;
  if (longer === shorter && intersection === shorter - 1) return true;
  if (longer === shorter + 1 && intersection === shorter) return true;
  return false;
}

function words(text: string) {
  const normalized = normalizeForLock(text);
  return normalized ? normalized.split(" ") : [];
}

function sharedWordCount(left: string[], right: string[]) {
  const counts = new Map<string, number>();
  for (const word of left) counts.set(word, (counts.get(word) ?? 0) + 1);
  let shared = 0;
  for (const word of right) {
    const remaining = counts.get(word) ?? 0;
    if (remaining > 0) {
      shared += 1;
      counts.set(word, remaining - 1);
    }
  }
  return shared;
}
