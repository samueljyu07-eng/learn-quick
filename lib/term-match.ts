// Turn a term into keys that ignore case, punctuation, and simple plurals.
export function termKeys(term: string): string[] {
  const base = term
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!base) return [];

  const keys = new Set<string>([base, stemPhrase(base)]);
  return [...keys];
}

export function termsMatch(left: string, right: string) {
  const rightKeys = new Set(termKeys(right));
  return termKeys(left).some((key) => rightKeys.has(key));
}

export function knownTermNames(candidates: string[], libraryTerms: string[]) {
  const known = new Set<string>();
  for (const candidate of candidates) {
    if (libraryTerms.some((saved) => termsMatch(candidate, saved))) known.add(candidate);
  }
  return known;
}

function stemPhrase(phrase: string) {
  return phrase
    .split(" ")
    .map((word) => stemWord(word))
    .join(" ");
}

function stemWord(word: string) {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith("es")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}
