import type {
  ParsedSourceSection,
  SourceParser,
  SourceParserInput,
  SourceParserOutput
} from "../types";

const MEBIBYTE = 1024 * 1024;

export interface BuiltinSourceParserOptions {
  maxBytes?: number;
  maxSections?: number;
}

export const DEFAULT_BUILTIN_SOURCE_PARSER_OPTIONS = {
  maxBytes: 10 * MEBIBYTE,
  maxSections: 10_000
} as const;

interface MarkdownHeading {
  startIndex: number;
  endIndex: number;
  level: number;
  title: string;
  path: string;
}

abstract class BuiltinSourceParser implements SourceParser {
  abstract readonly id: string;
  abstract readonly supportedFormats: readonly ("markdown" | "text")[];
  protected readonly options: Required<BuiltinSourceParserOptions>;

  constructor(options: BuiltinSourceParserOptions = {}) {
    this.options = validateOptions({
      ...DEFAULT_BUILTIN_SOURCE_PARSER_OPTIONS,
      ...options
    });
  }

  abstract parse(input: SourceParserInput): Promise<SourceParserOutput>;

  protected readText(input: SourceParserInput): { text: string; sourceBytes: number } {
    const sourceBytes = typeof input.content === "string"
      ? new TextEncoder().encode(input.content).byteLength
      : input.content.byteLength;
    if (sourceBytes > this.options.maxBytes) {
      throw new Error(
        `Source exceeds the ${this.options.maxBytes}-byte parser limit (${sourceBytes} bytes)`
      );
    }

    try {
      const text = typeof input.content === "string"
        ? input.content
        : new TextDecoder("utf-8", { fatal: true }).decode(input.content);
      return { text: text.replace(/^\uFEFF/, ""), sourceBytes };
    } catch (error) {
      throw new Error("Source content is not valid UTF-8 text", { cause: error });
    }
  }

  protected enforceSectionLimit(sectionCount: number): void {
    if (sectionCount > this.options.maxSections) {
      throw new Error(
        `Source exceeds the ${this.options.maxSections}-section parser limit (${sectionCount} sections)`
      );
    }
  }
}

export class BuiltinMarkdownSourceParser extends BuiltinSourceParser {
  readonly id = "builtin-markdown@1";
  readonly supportedFormats = ["markdown"] as const;

  async parse(input: SourceParserInput): Promise<SourceParserOutput> {
    if (input.format !== "markdown") {
      throw new Error(`BuiltinMarkdownSourceParser cannot parse format: ${input.format}`);
    }
    const { text, sourceBytes } = this.readText(input);
    const lines = splitLines(text);
    const headings = findMarkdownHeadings(lines);
    const sections: ParsedSourceSection[] = [];

    const firstHeadingIndex = headings[0]?.startIndex ?? lines.length;
    const preambleRange = trimBlankLineRange(lines, 0, firstHeadingIndex - 1);
    if (preambleRange) {
      sections.push(createTextSection({
        input,
        index: sections.length,
        title: input.title,
        section: "preamble",
        lines,
        startIndex: preambleRange.startIndex,
        endIndex: preambleRange.endIndex
      }));
    }

    headings.forEach((heading, headingIndex) => {
      const nextHeading = headings[headingIndex + 1];
      const rawEndIndex = nextHeading ? nextHeading.startIndex - 1 : lines.length - 1;
      const range = trimBlankLineRange(lines, heading.startIndex, rawEndIndex);
      if (!range) return;
      sections.push(createTextSection({
        input,
        index: sections.length,
        title: heading.title,
        section: heading.path,
        lines,
        startIndex: range.startIndex,
        endIndex: Math.max(range.endIndex, heading.endIndex)
      }));
    });

    this.enforceSectionLimit(sections.length);
    const warnings = sections.length === 0
      ? ["Markdown source contains no non-blank content."]
      : [];
    return {
      parserId: this.id,
      sections,
      warnings,
      metadata: {
        lineCount: countSourceLines(text),
        sectionCount: sections.length,
        headingCount: headings.length,
        sourceBytes
      }
    };
  }
}

export class BuiltinTextSourceParser extends BuiltinSourceParser {
  readonly id = "builtin-text@1";
  readonly supportedFormats = ["text"] as const;

  async parse(input: SourceParserInput): Promise<SourceParserOutput> {
    if (input.format !== "text") {
      throw new Error(`BuiltinTextSourceParser cannot parse format: ${input.format}`);
    }
    const { text, sourceBytes } = this.readText(input);
    const lines = splitLines(text);
    const sections: ParsedSourceSection[] = [];
    let paragraphStart: number | undefined;

    const flushParagraph = (endIndex: number) => {
      if (paragraphStart === undefined) return;
      const paragraphNumber = sections.length + 1;
      sections.push(createTextSection({
        input,
        index: sections.length,
        section: `paragraph-${paragraphNumber}`,
        lines,
        startIndex: paragraphStart,
        endIndex
      }));
      paragraphStart = undefined;
    };

    lines.forEach((line, index) => {
      if (line.trim()) {
        paragraphStart ??= index;
      } else {
        flushParagraph(index - 1);
      }
    });
    flushParagraph(lines.length - 1);

    this.enforceSectionLimit(sections.length);
    const warnings = sections.length === 0
      ? ["Text source contains no non-blank content."]
      : [];
    return {
      parserId: this.id,
      sections,
      warnings,
      metadata: {
        lineCount: countSourceLines(text),
        sectionCount: sections.length,
        sourceBytes
      }
    };
  }
}

function findMarkdownHeadings(lines: string[]): MarkdownHeading[] {
  const headings: Omit<MarkdownHeading, "path">[] = [];
  let fence: { marker: "`" | "~"; length: number } | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const fenceMatch = lines[index].match(/^ {0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0] as "`" | "~";
      if (!fence) {
        fence = { marker, length: fenceMatch[1].length };
      } else if (marker === fence.marker && fenceMatch[1].length >= fence.length) {
        fence = undefined;
      }
      continue;
    }
    if (fence) continue;

    const atx = lines[index].match(/^ {0,3}(#{1,6})(?:[\t ]+|$)(.*)$/);
    if (atx) {
      const title = atx[2].replace(/[\t ]+#+[\t ]*$/, "").trim();
      headings.push({
        startIndex: index,
        endIndex: index,
        level: atx[1].length,
        title: title || `Untitled section at line ${index + 1}`
      });
      continue;
    }

    const underline = lines[index + 1]?.match(/^ {0,3}(=+|-+)[\t ]*$/);
    if (lines[index].trim() && underline) {
      headings.push({
        startIndex: index,
        endIndex: index + 1,
        level: underline[1][0] === "=" ? 1 : 2,
        title: lines[index].trim()
      });
      index += 1;
    }
  }

  const titleStack: string[] = [];
  return headings.map((heading) => {
    titleStack.length = heading.level - 1;
    titleStack[heading.level - 1] = heading.title;
    return { ...heading, path: titleStack.filter(Boolean).join(" > ") };
  });
}

function createTextSection(args: {
  input: SourceParserInput;
  index: number;
  title?: string;
  section: string;
  lines: string[];
  startIndex: number;
  endIndex: number;
}): ParsedSourceSection {
  const sectionNumber = args.index + 1;
  const text = args.lines.slice(args.startIndex, args.endIndex + 1).join("\n");
  return {
    id: `${args.input.sourceId}-section-${sectionNumber}`,
    title: args.title,
    text,
    anchor: {
      id: `${args.input.sourceId}-anchor-section-${sectionNumber}`,
      sourceId: args.input.sourceId,
      locator: {
        kind: "text",
        lineStart: args.startIndex + 1,
        lineEnd: args.endIndex + 1,
        section: args.section
      },
      quote: text
    }
  };
}

function trimBlankLineRange(
  lines: string[],
  startIndex: number,
  endIndex: number
): { startIndex: number; endIndex: number } | undefined {
  while (startIndex <= endIndex && !lines[startIndex]?.trim()) startIndex += 1;
  while (endIndex >= startIndex && !lines[endIndex]?.trim()) endIndex -= 1;
  return startIndex <= endIndex ? { startIndex, endIndex } : undefined;
}

function splitLines(text: string): string[] {
  return text ? text.split(/\r\n|\n|\r/) : [];
}

function countSourceLines(text: string): number {
  return text ? splitLines(text).length : 0;
}

function validateOptions(
  options: Required<BuiltinSourceParserOptions>
): Required<BuiltinSourceParserOptions> {
  for (const [name, value] of Object.entries(options)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${name} must be a positive finite number`);
    }
  }
  return options;
}
