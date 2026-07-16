import { expect, test } from "vitest";
import {
  BuiltinMarkdownSourceParser,
  BuiltinTextSourceParser
} from "./builtinSourceParsers";

test("splits Markdown by heading hierarchy with exact line anchors", async () => {
  const source = [
    "Document preface",
    "",
    "# Architecture",
    "Overview",
    "",
    "```md",
    "# This is code, not a heading",
    "```",
    "",
    "## Storage",
    "Durable graph data"
  ].join("\n");
  const result = await new BuiltinMarkdownSourceParser().parse({
    sourceId: "source-md-1",
    title: "System design",
    uri: "memory://system.md",
    format: "markdown",
    content: source
  });

  expect(result.metadata).toMatchObject({ lineCount: 11, headingCount: 2, sectionCount: 3 });
  expect(result.sections.map((section) => section.title)).toEqual([
    "System design",
    "Architecture",
    "Storage"
  ]);
  expect(result.sections[1].text).toContain("# This is code, not a heading");
  expect(result.sections[1].anchor.locator).toEqual({
    kind: "text",
    lineStart: 3,
    lineEnd: 8,
    section: "Architecture"
  });
  expect(result.sections[2].anchor.locator).toEqual({
    kind: "text",
    lineStart: 10,
    lineEnd: 11,
    section: "Architecture > Storage"
  });
  expect(result.sections[2].anchor.quote).toBe("## Storage\nDurable graph data");
});

test("supports Setext headings and UTF-8 binary Markdown", async () => {
  const content = new TextEncoder().encode("研究目标\n====\n证据可追溯");
  const result = await new BuiltinMarkdownSourceParser().parse({
    sourceId: "source-md-2",
    title: "研究",
    uri: "memory://research.md",
    format: "markdown",
    content
  });

  expect(result.sections).toHaveLength(1);
  expect(result.sections[0].title).toBe("研究目标");
  expect(result.sections[0].anchor.locator).toEqual({
    kind: "text",
    lineStart: 1,
    lineEnd: 3,
    section: "研究目标"
  });
});

test("splits plain text into paragraphs and reports empty content", async () => {
  const parser = new BuiltinTextSourceParser();
  const result = await parser.parse({
    sourceId: "source-text-1",
    title: "Notes",
    uri: "memory://notes.txt",
    format: "text",
    content: "First line\ncontinues\n\nSecond paragraph"
  });

  expect(result.sections.map((section) => section.text)).toEqual([
    "First line\ncontinues",
    "Second paragraph"
  ]);
  expect(result.sections.map((section) => section.anchor.locator)).toEqual([
    { kind: "text", lineStart: 1, lineEnd: 2, section: "paragraph-1" },
    { kind: "text", lineStart: 4, lineEnd: 4, section: "paragraph-2" }
  ]);

  const empty = await parser.parse({
    sourceId: "source-text-empty",
    title: "Empty",
    uri: "memory://empty.txt",
    format: "text",
    content: " \n\n"
  });
  expect(empty.sections).toEqual([]);
  expect(empty.warnings).toEqual(["Text source contains no non-blank content."]);
});

test("rejects invalid UTF-8 and configured source limits", async () => {
  const parser = new BuiltinTextSourceParser({ maxBytes: 4, maxSections: 1 });
  const input = {
    sourceId: "source-text-limits",
    title: "Limits",
    uri: "memory://limits.txt",
    format: "text" as const
  };

  await expect(parser.parse({ ...input, content: "12345" })).rejects.toThrow("4-byte parser limit");
  await expect(parser.parse({ ...input, content: new Uint8Array([0xff]) })).rejects.toThrow(
    "not valid UTF-8"
  );
  await expect(parser.parse({ ...input, content: "a\n\nb" })).rejects.toThrow(
    "1-section parser limit"
  );
});
