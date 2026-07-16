import {
  getDocument,
  GlobalWorkerOptions,
  version as pdfJsVersion
} from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import type {
  ParsedSourceSection,
  SourceParser,
  SourceParserInput,
  SourceParserOutput
} from "../types";

const MEBIBYTE = 1024 * 1024;

export interface PdfJsSourceParserOptions {
  maxBytes?: number;
  maxPages?: number;
  maxTextItemsPerPage?: number;
  maxImagePixels?: number;
  timeoutMs?: number;
}

export const DEFAULT_PDF_JS_SOURCE_PARSER_OPTIONS = {
  maxBytes: 25 * MEBIBYTE,
  maxPages: 500,
  maxTextItemsPerPage: 50_000,
  maxImagePixels: 16_000_000,
  timeoutMs: 30_000
} as const;

interface PositionedTextItem {
  text: string;
  hasEOL: boolean;
  baseline: number;
  height: number;
  box: [number, number, number, number];
}

interface PdfJsTextItem {
  str: string;
  dir: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
  hasEOL: boolean;
}

/**
 * Configures the browser build to use the worker shipped by the exact same
 * pdfjs-dist package. Node uses PDF.js' local fake-worker path instead.
 */
export function configurePdfJsWorker(): string {
  const runtime = globalThis as typeof globalThis & {
    process?: { versions?: { node?: string } };
  };
  const isNodeRuntime = Boolean(runtime.process?.versions?.node);
  if (!isNodeRuntime) {
    GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  }
  return GlobalWorkerOptions.workerSrc;
}

export class PdfJsSourceParser implements SourceParser {
  readonly id = `pdfjs-dist@${pdfJsVersion}`;
  readonly supportedFormats = ["pdf"] as const;
  readonly options: Required<PdfJsSourceParserOptions>;

  constructor(options: PdfJsSourceParserOptions = {}) {
    this.options = validateOptions({
      ...DEFAULT_PDF_JS_SOURCE_PARSER_OPTIONS,
      ...options
    });
  }

  async parse(input: SourceParserInput): Promise<SourceParserOutput> {
    if (input.format !== "pdf") {
      throw new Error(`PdfJsSourceParser cannot parse format: ${input.format}`);
    }
    if (!isUint8Array(input.content)) {
      throw new Error("PDF content must be provided as Uint8Array binary data");
    }
    if (input.content.byteLength > this.options.maxBytes) {
      throw new Error(
        `PDF exceeds the ${this.options.maxBytes}-byte parser limit (${input.content.byteLength} bytes)`
      );
    }

    configurePdfJsWorker();
    const loadingTask = getDocument({
      // PDF.js may transfer this buffer to its worker, so preserve the caller's copy.
      data: Uint8Array.from(input.content),
      disableAutoFetch: true,
      disableRange: true,
      disableStream: true,
      enableXfa: false,
      maxImageSize: this.options.maxImagePixels,
      stopAtErrors: true,
      useSystemFonts: true,
      useWorkerFetch: false
    });
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      void loadingTask.destroy();
    }, this.options.timeoutMs);

    try {
      const document = await loadingTask.promise;
      if (document.numPages > this.options.maxPages) {
        throw new Error(
          `PDF exceeds the ${this.options.maxPages}-page parser limit (${document.numPages} pages)`
        );
      }

      const sections: ParsedSourceSection[] = [];
      const warnings: string[] = [];
      let textItemCount = 0;

      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const textItems = textContent.items.filter(isPdfJsTextItem);
        textItemCount += textItems.length;

        if (textItems.length > this.options.maxTextItemsPerPage) {
          throw new Error(
            `PDF page ${pageNumber} exceeds the ${this.options.maxTextItemsPerPage}-text-item limit ` +
            `(${textItems.length} items)`
          );
        }

        const pageSections = buildLineSections(input, pageNumber, textItems);
        sections.push(...pageSections);
        if (pageSections.length === 0) {
          warnings.push(
            `Page ${pageNumber} contains no extractable text; OCR may be required for scanned content.`
          );
        }
        page.cleanup();
      }

      return {
        parserId: this.id,
        sections,
        warnings,
        metadata: {
          pageCount: document.numPages,
          sectionCount: sections.length,
          sourceBytes: input.content.byteLength,
          textItemCount,
          pdfJsVersion
        }
      };
    } catch (error) {
      if (timedOut) {
        throw new Error(`PDF parsing timed out after ${this.options.timeoutMs} ms`, { cause: error });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      await loadingTask.destroy().catch(() => undefined);
    }
  }
}

export function createPdfJsSourceParser(
  options?: PdfJsSourceParserOptions
): PdfJsSourceParser {
  return new PdfJsSourceParser(options);
}

function validateOptions(
  options: Required<PdfJsSourceParserOptions>
): Required<PdfJsSourceParserOptions> {
  for (const [name, value] of Object.entries(options)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${name} must be a positive finite number`);
    }
  }
  return options;
}

function isPdfJsTextItem(item: unknown): item is PdfJsTextItem {
  if (!item || typeof item !== "object" || !("str" in item) || !("transform" in item)) {
    return false;
  }
  const candidate = item as Partial<PdfJsTextItem>;
  return typeof candidate.str === "string" && Array.isArray(candidate.transform);
}

function isUint8Array(value: string | Uint8Array): value is Uint8Array {
  return typeof value !== "string" && Object.prototype.toString.call(value) === "[object Uint8Array]";
}

function buildLineSections(
  input: SourceParserInput,
  pageNumber: number,
  items: PdfJsTextItem[]
): ParsedSourceSection[] {
  const lines: PositionedTextItem[][] = [];
  let currentLine: PositionedTextItem[] = [];

  const flushLine = () => {
    if (currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = [];
    }
  };

  for (const item of items) {
    if (!item.str.trim()) {
      if (item.hasEOL) flushLine();
      continue;
    }
    const positioned = positionTextItem(item);
    const previous = currentLine.at(-1);
    const tolerance = previous ? Math.max(2, Math.min(6, previous.height * 0.5)) : 0;
    if (previous && Math.abs(positioned.baseline - previous.baseline) > tolerance) {
      flushLine();
    }
    currentLine.push(positioned);
    if (item.hasEOL) flushLine();
  }
  flushLine();

  return lines.flatMap((line, index) => {
    const text = line.reduce((combined, item) => joinText(combined, item.text), "").trim();
    if (!text) return [];
    const boundingBox = mergeBoxes(line.map((item) => item.box));
    const lineNumber = index + 1;
    return [{
      id: `${input.sourceId}-page-${pageNumber}-line-${lineNumber}`,
      title: `${input.title} · 第 ${pageNumber} 页`,
      text,
      anchor: {
        id: `${input.sourceId}-anchor-page-${pageNumber}-line-${lineNumber}`,
        sourceId: input.sourceId,
        locator: {
          kind: "pdf" as const,
          page: pageNumber,
          section: `line-${lineNumber}`,
          boundingBox
        },
        quote: text
      }
    }];
  });
}

function positionTextItem(item: PdfJsTextItem): PositionedTextItem {
  const x = finiteOrZero(item.transform[4]);
  const baseline = finiteOrZero(item.transform[5]);
  const width = Math.abs(finiteOrZero(item.width));
  const transformHeight = Math.hypot(
    finiteOrZero(item.transform[2]),
    finiteOrZero(item.transform[3])
  );
  const height = Math.max(Math.abs(finiteOrZero(item.height)), transformHeight, 1);
  return {
    text: item.str,
    hasEOL: item.hasEOL,
    baseline,
    height,
    // PDF user-space coordinates: [xMin, yMin, xMax, yMax], bottom-left origin.
    box: [round(x), round(baseline - height), round(x + width), round(baseline)]
  };
}

function mergeBoxes(boxes: [number, number, number, number][]): [number, number, number, number] {
  return [
    round(Math.min(...boxes.map((box) => box[0]))),
    round(Math.min(...boxes.map((box) => box[1]))),
    round(Math.max(...boxes.map((box) => box[2]))),
    round(Math.max(...boxes.map((box) => box[3])))
  ];
}

function joinText(current: string, next: string): string {
  if (!current || /\s$/.test(current) || /^\s/.test(next)) return current + next;
  if (/^[,.;:!?%)\]}，。；：！？、]/.test(next)) return current + next;
  if (/[\u3400-\u9fff]$/.test(current) && /^[\u3400-\u9fff]/.test(next)) return current + next;
  return `${current} ${next}`;
}

function finiteOrZero(value: number | undefined): number {
  return Number.isFinite(value) ? value! : 0;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
