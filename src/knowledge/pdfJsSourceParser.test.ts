import { expect, test } from "vitest";
import { PdfJsSourceParser, configurePdfJsWorker } from "./pdfJsSourceParser";

test("extracts text with page and bounding-box anchors from a real PDF", async () => {
  const parser = new PdfJsSourceParser();
  const pdf = buildMinimalPdf("AlphaAiGraph PDF source");
  const result = await parser.parse({
    sourceId: "source-pdf-1",
    title: "Minimal fixture",
    uri: "memory://minimal.pdf",
    format: "pdf",
    mediaType: "application/pdf",
    content: pdf
  });

  expect(parser.id).toBe("pdfjs-dist@6.1.200");
  expect(result.metadata).toMatchObject({ pageCount: 1, pdfJsVersion: "6.1.200" });
  expect(result.warnings).toEqual([]);
  expect(result.sections).toHaveLength(1);
  expect(result.sections[0].text).toBe("AlphaAiGraph PDF source");
  expect(result.sections[0].anchor.quote).toBe("AlphaAiGraph PDF source");
  expect(result.sections[0].anchor.locator).toMatchObject({
    kind: "pdf",
    page: 1,
    section: "line-1"
  });
  const locator = result.sections[0].anchor.locator;
  expect(locator.kind === "pdf" && locator.boundingBox).toEqual([
    expect.any(Number),
    expect.any(Number),
    expect.any(Number),
    expect.any(Number)
  ]);
});

test("uses only a package-local worker and enforces binary and size limits", async () => {
  expect(configurePdfJsWorker()).not.toMatch(/^https?:\/\//);
  const parser = new PdfJsSourceParser({ maxBytes: 16 });
  const baseInput = {
    sourceId: "source-pdf-2",
    title: "Limits",
    uri: "memory://limits.pdf",
    format: "pdf" as const
  };

  await expect(parser.parse({ ...baseInput, content: "%PDF-1.4" })).rejects.toThrow(
    "Uint8Array"
  );
  await expect(parser.parse({ ...baseInput, content: new Uint8Array(17) })).rejects.toThrow(
    "16-byte parser limit"
  );
});

function buildMinimalPdf(text: string): Uint8Array {
  const escapedText = text.replace(/([\\()])/g, "\\$1");
  const stream = `BT\n/F1 18 Tf\n72 720 Td\n(${escapedText}) Tj\nET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
      "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
