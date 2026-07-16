import { expect, test, vi } from "vitest";
import type { SourceParser } from "../types";
import { selectSourceParser } from "./sourceParser";
import { createDefaultSourceParsers } from "./sourceParserRegistry";

test("keeps PDF parsing behind a replaceable parser adapter", async () => {
  const parse = vi.fn(async () => ({
    parserId: "evaluated-pdf-adapter",
    sections: [{
      id: "section-1",
      title: "Introduction",
      text: "PDF text",
      anchor: { id: "anchor-1", sourceId: "source-1", locator: { kind: "pdf" as const, page: 1 } }
    }],
    warnings: [],
    metadata: { pageCount: 1 }
  }));
  const parser: SourceParser = {
    id: "evaluated-pdf-adapter",
    supportedFormats: ["pdf"],
    parse
  };

  const selected = selectSourceParser([parser], "pdf");
  const result = await selected!.parse({
    sourceId: "source-1",
    title: "Example",
    uri: "file:///example.pdf",
    format: "pdf",
    mediaType: "application/pdf",
    content: new Uint8Array([37, 80, 68, 70])
  });

  expect(selected?.id).toBe("evaluated-pdf-adapter");
  expect(result.sections[0].anchor.locator).toEqual({ kind: "pdf", page: 1 });
  expect(parse).toHaveBeenCalledOnce();
});

test("reports PDF as unavailable until an adapter is registered", () => {
  const markdownParser: SourceParser = {
    id: "builtin-markdown",
    supportedFormats: ["markdown"],
    async parse() {
      return { parserId: "builtin-markdown", sections: [], warnings: [], metadata: {} };
    }
  };

  expect(selectSourceParser([markdownParser], "pdf")).toBeUndefined();
});

test("creates a replaceable default registry for every supported source format", () => {
  const parsers = createDefaultSourceParsers();

  expect(selectSourceParser(parsers, "markdown")?.id).toBe("builtin-markdown@1");
  expect(selectSourceParser(parsers, "text")?.id).toBe("builtin-text@1");
  expect(selectSourceParser(parsers, "pdf")?.id).toBe("pdfjs-dist@6.1.200");
});
