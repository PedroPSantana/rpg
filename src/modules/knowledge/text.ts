/** Lowercase, strip accents and punctuation — shared by search and ingestion. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set("a o as os de da do das dos e em no na nos nas um uma uns umas para por com sem que se ao aos ou eu meu minha voce como qual quais quando onde ser ter tem mais menos".split(" "));

export function tokenize(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

/** Very light Portuguese suffix stripping; good enough for rule lookup. */
function stem(token: string): string {
  let t = token;
  for (const suffix of ["mente", "coes", "cao", "oes", "ais", "eis", "ores", "dor", "as", "os", "es", "s"]) {
    if (t.length > suffix.length + 3 && t.endsWith(suffix)) {
      t = t.slice(0, -suffix.length);
      break;
    }
  }
  // Drop a final thematic vowel so "distribuo"/"distribua" and "ataque"/"atacar" stay close.
  if (t.length > 4 && /[aeo]$/.test(t)) t = t.slice(0, -1);
  return t;
}
