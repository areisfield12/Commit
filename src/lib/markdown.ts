import matter from "gray-matter";
import yaml from "js-yaml";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkHtml from "remark-html";
import remarkStringify from "remark-stringify";
import TurndownService from "turndown";
import { FrontmatterData } from "@/types";

// ─── Frontmatter ───────────────────────────────────────────────────────────

/**
 * Extract YAML frontmatter and body from a raw markdown string.
 */
export function extractFrontmatter(raw: string): {
  data: FrontmatterData;
  content: string;
} {
  const { data, content } = matter(raw);
  return { data: data as FrontmatterData, content };
}

/**
 * Normalize a frontmatter date value to a plain YYYY-MM-DD string.
 * Handles Date objects (from gray-matter parsing) and ISO timestamp strings.
 */
function normalizeDate(
  val: string | number | boolean | string[] | null
): string | number | boolean | string[] | null {
  if (!val) return val;
  if (typeof val === "string") return val.split("T")[0];
  if (val instanceof Date) {
    const y = val.getUTCFullYear();
    const m = String(val.getUTCMonth() + 1).padStart(2, "0");
    const d = String(val.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return val;
}

/**
 * Serialize frontmatter data + body back into a raw markdown string.
 *
 * Uses JSON_SCHEMA to avoid quoting date-like strings, flowLevel:1 to keep
 * arrays inline (e.g. tags: [a, b]), and lineWidth:-1 to prevent block
 * scalars on long strings (e.g. description).
 */
export function serializeFrontmatter(
  data: FrontmatterData,
  content: string
): string {
  if (Object.keys(data).length === 0) return content;

  const normalized = { ...data };
  if ("date" in normalized) {
    normalized.date = normalizeDate(normalized.date);
  }

  return matter.stringify(content, normalized, {
    engines: {
      yaml: {
        parse: (str: string) => yaml.load(str) as Record<string, unknown>,
        stringify: (obj: object) =>
          yaml.dump(obj, {
            flowLevel: 1,
            lineWidth: -1,
            schema: yaml.JSON_SCHEMA,
          }),
      },
    },
  });
}

// ─── MDX component preprocessing ──────────────────────────────────────────

/**
 * Base64-encode a string so it survives HTML attribute/text escaping intact.
 * UTF-8 safe in both Node and the browser.
 */
export function encodeMdxRawSource(raw: string): string {
  if (typeof window === "undefined") {
    return Buffer.from(raw, "utf-8").toString("base64");
  }
  return btoa(unescape(encodeURIComponent(raw)));
}

export function decodeMdxRawSource(encoded: string): string {
  const trimmed = encoded.trim();
  if (!trimmed) return "";
  try {
    if (typeof window === "undefined") {
      return Buffer.from(trimmed, "base64").toString("utf-8");
    }
    return decodeURIComponent(escape(atob(trimmed)));
  } catch {
    return trimmed;
  }
}

/**
 * Split markdown into alternating non-code and code segments. Code fences
 * (``` or ~~~ — opened at the start of a line, optionally indented up to 3
 * spaces) are kept verbatim so JSX inside code samples is never preprocessed.
 */
function splitByCodeFences(
  text: string
): Array<{ text: string; isCode: boolean }> {
  const out: Array<{ text: string; isCode: boolean }> = [];
  const lines = text.split("\n");
  let buf: string[] = [];
  let inFence = false;
  let fenceMarker = "";

  const flush = (isCode: boolean) => {
    if (buf.length === 0) return;
    out.push({ text: buf.join("\n"), isCode });
    buf = [];
  };

  for (const line of lines) {
    if (!inFence) {
      const open = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (open) {
        flush(false);
        inFence = true;
        fenceMarker = open[1][0];
        buf.push(line);
        continue;
      }
      buf.push(line);
    } else {
      buf.push(line);
      const close = line.match(/^\s{0,3}([`~]{3,})\s*$/);
      if (close && close[1][0] === fenceMarker) {
        flush(true);
        inFence = false;
        fenceMarker = "";
      }
    }
  }
  flush(inFence);
  return out;
}

/**
 * Locate the next capitalized JSX-style tag (e.g. `<Card`, `<CardGrid`) at the
 * given offset. Returns the tag name and the index just past the opening `<`,
 * or null if no tag starts here. Only matches tags whose name begins with an
 * uppercase letter — that's the MDX convention that separates components from
 * plain HTML.
 */
function matchCapitalizedTagOpen(
  text: string,
  i: number
): { tagName: string; afterName: number } | null {
  if (text[i] !== "<") return null;
  let j = i + 1;
  if (j >= text.length) return null;
  const first = text[j];
  if (first < "A" || first > "Z") return null;
  while (j < text.length && /[A-Za-z0-9_]/.test(text[j])) j++;
  const tagName = text.slice(i + 1, j);
  if (!tagName) return null;
  return { tagName, afterName: j };
}

/**
 * Starting just past `<TagName`, find the end of the opening tag — either
 * `/>` (self-closing) or `>` (paired). Respects single and double quoted
 * attribute values so `>` inside an attribute doesn't terminate the tag early.
 * Returns null if the opening tag never closes.
 */
function findTagOpenEnd(
  text: string,
  start: number
): { end: number; selfClosing: boolean } | null {
  let i = start;
  let quote: '"' | "'" | "`" | null = null;
  while (i < text.length) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch as '"' | "'" | "`";
      i++;
      continue;
    }
    if (ch === "/" && text[i + 1] === ">") {
      return { end: i + 2, selfClosing: true };
    }
    if (ch === ">") {
      return { end: i + 1, selfClosing: false };
    }
    i++;
  }
  return null;
}

/**
 * Find the matching `</TagName>` for a paired component tag, accounting for
 * nested same-named tags via simple depth tracking. Returns the index just
 * past the closing tag, or null if no balanced close exists.
 */
function findMatchingClose(
  text: string,
  start: number,
  tagName: string
): number | null {
  const escapedName = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tagRegex = new RegExp(
    `<(/?)${escapedName}(?=[\\s/>])`,
    "g"
  );
  tagRegex.lastIndex = start;
  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(text)) !== null) {
    const isClose = match[1] === "/";
    if (isClose) {
      depth--;
      if (depth === 0) {
        const closeEnd = text.indexOf(">", match.index);
        if (closeEnd === -1) return null;
        return closeEnd + 1;
      }
    } else {
      // Skip if it's self-closing — that doesn't increase depth
      const openEnd = findTagOpenEnd(text, match.index + match[0].length);
      if (!openEnd) return null;
      if (!openEnd.selfClosing) depth++;
      tagRegex.lastIndex = openEnd.end;
    }
  }
  return null;
}

/**
 * Convert each capitalized JSX-style tag in `text` into a self-contained HTML
 * placeholder block: `<div data-mdx-component data-tag-name="Card">BASE64</div>`.
 *
 * Only matches tags that start at the beginning of a line (column 0 or after
 * optional indentation that's part of a fresh line) so we don't eat inline
 * JSX inside a sentence. Paired tags greedily capture their full inner
 * content into rawSource — we don't recurse into children.
 */
function transformMdxInSegment(text: string): string {
  let out = "";
  let i = 0;
  const len = text.length;

  while (i < len) {
    // Must be at the start of a line (preceded by newline) or beginning of segment.
    const atLineStart = i === 0 || text[i - 1] === "\n";
    if (atLineStart && text[i] === "<") {
      const open = matchCapitalizedTagOpen(text, i);
      if (open) {
        const openEnd = findTagOpenEnd(text, open.afterName);
        if (openEnd) {
          let blockEnd = -1;
          if (openEnd.selfClosing) {
            blockEnd = openEnd.end;
          } else {
            const close = findMatchingClose(text, openEnd.end, open.tagName);
            if (close !== null) blockEnd = close;
          }
          if (blockEnd !== -1) {
            const rawSource = text.slice(i, blockEnd);
            const encoded = encodeMdxRawSource(rawSource);
            const safeName = open.tagName.replace(/[^A-Za-z0-9_]/g, "");
            out += `\n\n<div data-mdx-component data-tag-name="${safeName}">${encoded}</div>\n\n`;
            i = blockEnd;
            // Skip a single trailing newline so we don't compound blank lines.
            if (text[i] === "\n") i++;
            continue;
          }
        }
      }
    }
    out += text[i];
    i++;
  }
  return out;
}

/**
 * Rewrite capitalized JSX-style tags (`<Card />`, `<CardGrid>...</CardGrid>`)
 * into HTML placeholder blocks that TipTap's MdxComponent node can parse,
 * while leaving code-fenced JSX samples untouched.
 */
export function preprocessMdxComponents(markdown: string): string {
  return splitByCodeFences(markdown)
    .map((seg) => (seg.isCode ? seg.text : transformMdxInSegment(seg.text)))
    .join("\n");
}

// ─── Markdown → HTML (for TipTap) ─────────────────────────────────────────

/**
 * Convert markdown body (no frontmatter) to HTML for loading into TipTap.
 */
export async function markdownToHtml(markdown: string): Promise<string> {
  const preprocessed = preprocessMdxComponents(markdown);
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkHtml, { sanitize: false })
    .process(preprocessed);

  return result.toString();
}

// ─── HTML → Markdown (from TipTap) ────────────────────────────────────────

const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

// Support GitHub Flavored Markdown tables
turndownService.addRule("table", {
  filter: ["table"],
  replacement: (content, node) => {
    const table = node as HTMLElement;
    const rows = Array.from(table.querySelectorAll("tr"));
    if (rows.length === 0) return content;

    const headerRow = rows[0];
    const headerCells = Array.from(headerRow.querySelectorAll("th, td")).map(
      (cell) => cell.textContent?.trim() ?? ""
    );

    const separator = headerCells.map(() => "---");
    const dataRows = rows.slice(1).map((row) =>
      Array.from(row.querySelectorAll("td")).map(
        (cell) => cell.textContent?.trim() ?? ""
      )
    );

    const lines = [
      `| ${headerCells.join(" | ")} |`,
      `| ${separator.join(" | ")} |`,
      ...dataRows.map((row) => `| ${row.join(" | ")} |`),
    ];

    return "\n\n" + lines.join("\n") + "\n\n";
  },
});

// Use data-markdown-src for images uploaded via Commit (stores relative path
// while src uses a GitHub raw URL for in-editor preview)
turndownService.addRule("commitImage", {
  filter: (node) => {
    return (
      node.nodeName === "IMG" &&
      node.getAttribute("data-markdown-src") !== null
    );
  },
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const src = el.getAttribute("data-markdown-src") ?? el.getAttribute("src") ?? "";
    const alt = el.getAttribute("alt") ?? "";
    return `![${alt}](${src})`;
  },
});

// Round-trip MDX component placeholders back to their original JSX source.
// The base64 payload in textContent is the canonical source — we ignore the
// rendered chip entirely so edits made via the popover flow through cleanly.
turndownService.addRule("mdxComponent", {
  filter: (node) => {
    return (
      node.nodeName === "DIV" &&
      (node as HTMLElement).hasAttribute("data-mdx-component")
    );
  },
  replacement: (_content, node) => {
    const encoded = (node as HTMLElement).textContent ?? "";
    const raw = decodeMdxRawSource(encoded);
    return "\n\n" + raw + "\n\n";
  },
});

// Preserve code blocks with language hints
turndownService.addRule("fencedCodeBlock", {
  filter: (node) => {
    return (
      node.nodeName === "PRE" &&
      node.firstChild !== null &&
      node.firstChild.nodeName === "CODE"
    );
  },
  replacement: (content, node) => {
    const codeNode = (node as HTMLElement).querySelector("code");
    const className = codeNode?.className ?? "";
    const langMatch = className.match(/language-(\S+)/);
    const lang = langMatch ? langMatch[1] : "";
    const code = codeNode?.textContent ?? content;
    return `\n\n\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
  },
});

/**
 * Convert TipTap HTML output back to clean Markdown.
 */
export function htmlToMarkdown(html: string): string {
  return turndownService.turndown(html);
}

// ─── Markdown normalization ────────────────────────────────────────────────

/**
 * Normalize a raw markdown string (roundtrip through remark to clean up formatting).
 */
export async function normalizeMarkdown(raw: string): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkStringify, {
      bullet: "-",
      fences: true,
      incrementListMarker: false,
    })
    .process(raw);
  return result.toString();
}

/**
 * Split a raw file into frontmatter + body HTML ready for TipTap.
 * Returns:
 * - frontmatterData: key-value pairs for the FrontmatterEditor
 * - bodyHtml: HTML string for loading into TipTap
 * - hasFrontmatter: whether the file had frontmatter
 */
export async function prepareFileForEditor(raw: string): Promise<{
  frontmatterData: FrontmatterData;
  bodyHtml: string;
  hasFrontmatter: boolean;
}> {
  const { data, content } = extractFrontmatter(raw);
  const bodyHtml = await markdownToHtml(content);
  return {
    frontmatterData: data,
    bodyHtml,
    hasFrontmatter: Object.keys(data).length > 0,
  };
}

/**
 * Reconstruct full raw markdown from frontmatter data + TipTap HTML.
 */
export function buildRawMarkdown(
  frontmatterData: FrontmatterData,
  bodyHtml: string
): string {
  const bodyMarkdown = htmlToMarkdown(bodyHtml);
  return serializeFrontmatter(frontmatterData, bodyMarkdown);
}
