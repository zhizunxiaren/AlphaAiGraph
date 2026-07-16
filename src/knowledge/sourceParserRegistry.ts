import type { SourceParser } from "../types";
import {
  BuiltinMarkdownSourceParser,
  BuiltinTextSourceParser,
  type BuiltinSourceParserOptions
} from "./builtinSourceParsers";
import {
  PdfJsSourceParser,
  type PdfJsSourceParserOptions
} from "./pdfJsSourceParser";

export interface DefaultSourceParserOptions {
  text?: BuiltinSourceParserOptions;
  pdf?: PdfJsSourceParserOptions;
}

/** Creates the standard parser set while keeping every adapter replaceable. */
export function createDefaultSourceParsers(
  options: DefaultSourceParserOptions = {}
): SourceParser[] {
  return [
    new BuiltinMarkdownSourceParser(options.text),
    new BuiltinTextSourceParser(options.text),
    new PdfJsSourceParser(options.pdf)
  ];
}
