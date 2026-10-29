import { z } from "zod";

/**
 * Authorized document ingestion. Turns owner-provided Markdown / plain text /
 * JSON (and PDF text extracted by scripts/ingest-source.ts) into chunks with
 * provenance, and flags extraction problems. Ingested text is NOT verified
 * rule data: it only supports retrieval and human verification.
 */
export const SourceChunkSchema = z.object({
  sourceId: z.string(),
  ordinal: z.number().int(),
  headingPath: z.array(z.string()),
  page: z.number().int().nullable(),
  content: z.string(),
  flags: z.array(z.enum(["empty_section", "possible_broken_table", "possible_broken_formula", "ambiguous_reference", "very_long", "low_text_density"])),
});
export type SourceChunk = z.infer<typeof SourceChunkSchema>;

const PAGE_MARKER = /^\s*(?:<!--\s*page:\s*(\d+)\s*-->|\[p(?:ág|ag)?\.?\s*(\d+)\]|\f\s*(\d+)?)\s*$/i;

export function chunkText(sourceId: string, text: string, options: { maxChars?: number } = {}): SourceChunk[] {
  const maxChars = options.maxChars ?? 2000;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const chunks: SourceChunk[] = [];
  const headings: string[] = [];
  let page: number | null = null;
  let buffer: string[] = [];

  const flush = () => {
    const content = buffer.join("\n").trim();
    buffer = [];
    if (!content && !headings.length) return;
    if (!content && chunks.some((c) => c.headingPath.join("/") === headings.join("/"))) return;
    const parts = content.length > maxChars ? splitLong(content, maxChars) : [content];
    for (const part of parts) {
      chunks.push({ sourceId, ordinal: chunks.length, headingPath: [...headings], page, content: part, flags: detectFlags(part, content.length > maxChars) });
    }
  };

  for (const line of lines) {
    const pm = line.match(PAGE_MARKER);
    if (pm) {
      // Chunks never span pages so every chunk has an exact page locator.
      if (buffer.some((l) => l.trim())) flush();
      const n = pm[1] ?? pm[2] ?? pm[3];
      if (n) page = Number(n);
      else if (page !== null) page += 1;
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flush();
      const level = h[1].length;
      headings.splice(level - 1);
      headings[level - 1] = h[2].trim();
      continue;
    }
    buffer.push(line);
  }
  flush();
  return chunks.filter((c, i, all) => c.content || !all.some((o) => o.headingPath.join("/").startsWith(c.headingPath.join("/") + "/")));
}

/** JSON sources: an array of { heading, page?, text } objects. */
export const JsonSourceSchema = z.array(z.object({ heading: z.union([z.string(), z.array(z.string())]), page: z.number().int().optional(), text: z.string() }));

export function chunkJson(sourceId: string, data: unknown): SourceChunk[] {
  const entries = JsonSourceSchema.parse(data);
  return entries.map((e, i) => ({
    sourceId,
    ordinal: i,
    headingPath: Array.isArray(e.heading) ? e.heading : [e.heading],
    page: e.page ?? null,
    content: e.text.trim(),
    flags: detectFlags(e.text, false),
  }));
}

function splitLong(content: string, maxChars: number): string[] {
  const paragraphs = content.split(/\n{2,}/);
  const out: string[] = [];
  let cur = "";
  for (const p of paragraphs) {
    if ((cur + "\n\n" + p).length > maxChars && cur) {
      out.push(cur);
      cur = p;
    } else cur = cur ? `${cur}\n\n${p}` : p;
  }
  if (cur) out.push(cur);
  return out;
}

export function detectFlags(content: string, wasSplit: boolean): SourceChunk["flags"] {
  const flags: SourceChunk["flags"] = [];
  if (!content.trim()) flags.push("empty_section");
  const lines = content.split("\n");
  const pipeLines = lines.filter((l) => l.includes("|")).length;
  const tabularish = lines.filter((l) => /\S\s{3,}\S/.test(l)).length;
  if ((pipeLines > 0 && pipeLines < 2) || tabularish >= 3) flags.push("possible_broken_table");
  if (/\d+d\d+\s*[+\-x×]\s*$/m.test(content) || /[=+]\s*$/m.test(content) || /\(\s*[^)]*$/.test(content)) flags.push("possible_broken_formula");
  if (/\b(veja|ver) (a )?(p[aá]gina|cap[ií]tulo)\s*(\?|xx|\.\.\.)/i.test(content) || /\b(p[aá]gina|p\.)\s*\?\?/i.test(content)) flags.push("ambiguous_reference");
  if (wasSplit) flags.push("very_long");
  const letters = (content.match(/[a-zA-ZÀ-ÿ]/g) ?? []).length;
  if (content.length > 40 && letters / content.length < 0.4) flags.push("low_text_density");
  return flags;
}
