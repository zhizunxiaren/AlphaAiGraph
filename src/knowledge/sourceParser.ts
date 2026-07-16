import type { KnowledgeSourceFormat, SourceParser } from "../types";

/**
 * Selects an installed parser adapter without coupling ingest orchestration to
 * a concrete PDF/Markdown library. Returning undefined is intentional when
 * the caller has not registered an adapter for the requested format.
 */
export function selectSourceParser(
  parsers: readonly SourceParser[],
  format: KnowledgeSourceFormat
): SourceParser | undefined {
  return parsers.find((parser) => parser.supportedFormats.includes(format));
}
