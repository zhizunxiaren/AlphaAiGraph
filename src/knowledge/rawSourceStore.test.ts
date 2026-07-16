// @vitest-environment node
import { expect, test } from "vitest";
import type { IngestRequest, SourceAnchor } from "../types";
import { InMemoryRawSourceStore, sha256ContentHash } from "./rawSourceStore";

test("computes the standard SHA-256 digest over exact raw bytes", async () => {
  expect(await sha256ContentHash("abc")).toBe(
    "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  );
  expect(await sha256ContentHash("line\n")).not.toBe(await sha256ContentHash("line\r\n"));
});

test("deduplicates identical input and appends changed content as a new immutable version", async () => {
  const store = new InMemoryRawSourceStore();
  const request = ingestRequest();
  const first = await store.append({ request, content: "version one" });
  const duplicate = await store.append({ request, content: "version one" });
  const second = await store.append({
    request: { ...request, id: "ingest-2", requestedAt: "2026-07-14T01:00:00.000Z" },
    content: "version two"
  });
  const reverted = await store.append({
    request: { ...request, id: "ingest-3", requestedAt: "2026-07-14T02:00:00.000Z" },
    content: "version one"
  });

  expect(duplicate.asset).toBe(first.asset);
  expect(first.asset).toMatchObject({
    logicalSourceId: "guide",
    version: 1,
    previousVersionId: undefined,
    inventoryKind: "document",
    immutable: true,
    byteLength: 11
  });
  expect(second.asset).toMatchObject({
    logicalSourceId: "guide",
    version: 2,
    previousVersionId: first.asset.id,
    immutable: true
  });
  expect(reverted.asset).toMatchObject({
    version: 3,
    previousVersionId: second.asset.id,
    contentHash: first.asset.contentHash
  });
  expect(store.listVersions("guide").map((asset) => asset.id)).toEqual([
    first.asset.id,
    second.asset.id,
    reverted.asset.id
  ]);
});

test("never exposes mutable raw bytes and detects anchor hash drift", async () => {
  const store = new InMemoryRawSourceStore();
  const record = await store.append({ request: ingestRequest(), content: "trusted source" });
  const fetched = store.get(record.asset.id)!;
  fetched.content[0] = 0;

  expect(await store.verify(record.asset.id)).toBe(true);
  expect(() => {
    (record.asset as { title: string }).title = "mutated";
  }).toThrow();

  const anchor: SourceAnchor = {
    id: "anchor-1",
    sourceId: record.asset.id,
    locator: { kind: "text", lineStart: 1 },
    quote: "trusted source",
    contentHash: record.asset.contentHash
  };
  expect(() => store.assertAnchorIntegrity(anchor)).not.toThrow();
  expect(() => store.assertAnchorIntegrity({ ...anchor, contentHash: "sha256:stale" })).toThrow(
    "hash does not match"
  );
  expect(() => store.assertAnchorIntegrity({ ...anchor, contentHash: undefined })).toThrow(
    "missing its immutable content hash"
  );
});

test("rejects invalid provenance before storing bytes", async () => {
  const store = new InMemoryRawSourceStore();
  await expect(store.append({
    request: { ...ingestRequest(), uri: "relative/path.md" },
    content: "content"
  })).rejects.toThrow("must be absolute");
  expect(store.listVersions("guide")).toEqual([]);
});

function ingestRequest(): IngestRequest {
  return {
    id: "ingest-1",
    projectId: "project-1",
    spaceId: "space-main",
    sourceId: "guide",
    title: "Architecture guide",
    uri: "file:///workspace/architecture.md",
    format: "markdown",
    mediaType: "text/markdown",
    requestedAt: "2026-07-14T00:00:00.000Z"
  };
}
