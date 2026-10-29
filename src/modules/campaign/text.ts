/** Lowercases a name for use mid-sentence, keeping proper nouns inside it ("Entrada do Sobrado Toledo" → "entrada do Sobrado Toledo"). */
export function lowerName(name: string) {
  return name.length > 1 && name[1] === name[1].toLowerCase() ? name[0].toLowerCase() + name.slice(1) : name;
}
