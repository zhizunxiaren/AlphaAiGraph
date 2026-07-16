import type {
  IngestRequest,
  KnowledgeSourceAsset,
  SourceAnchor,
  SourceParserInput
} from "../types";

export interface StoreRawSourceInput {
  request: IngestRequest;
  content: SourceParserInput["content"];
}

export interface RawSourceRecord {
  asset: KnowledgeSourceAsset;
  content: Uint8Array;
}

export interface RawSourceStore {
  append(input: StoreRawSourceInput): Promise<RawSourceRecord>;
  get(assetId: string): RawSourceRecord | undefined;
  listVersions(logicalSourceId: string): readonly KnowledgeSourceAsset[];
  verify(assetId: string): Promise<boolean>;
  assertAnchorIntegrity(anchor: SourceAnchor): void;
}

/** Browser-compatible SHA-256 over the exact raw bytes, without text normalization. */
export async function sha256ContentHash(content: string | Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto SHA-256 is unavailable in this runtime");
  }
  const bytes = toRawBytes(content);
  const digestInput = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(digestInput).set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", digestInput);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}

/**
 * Append-only in-memory boundary for raw source bytes. It intentionally has no
 * update/delete methods; persistence can implement the same semantics later.
 */
export class InMemoryRawSourceStore implements RawSourceStore {
  readonly #records = new Map<string, { asset: KnowledgeSourceAsset; content: Uint8Array }>();
  readonly #versionIds = new Map<string, string[]>();

  async append({ request, content }: StoreRawSourceInput): Promise<RawSourceRecord> {
    validateRequest(request);
    const bytes = toRawBytes(content);
    const contentHash = await sha256ContentHash(bytes);
    const versionIds = this.#versionIds.get(request.sourceId) ?? [];
    const latest = versionIds.length > 0
      ? this.#records.get(versionIds[versionIds.length - 1])
      : undefined;
    const duplicate = latest && sameImmutableSource(
      latest.asset,
      request,
      contentHash,
      bytes.byteLength
    ) ? latest : undefined;
    if (duplicate) return copyRecord(duplicate);

    const version = versionIds.length + 1;
    const previousVersionId = versionIds.at(-1);
    const id = `${request.sourceId}@v${version}-${contentHash.slice("sha256:".length, "sha256:".length + 12)}`;
    if (this.#records.has(id)) {
      throw new Error(`Raw source version id collision: ${id}`);
    }
    const asset: KnowledgeSourceAsset = Object.freeze({
      id,
      logicalSourceId: request.sourceId,
      version,
      previousVersionId,
      spaceId: request.spaceId,
      inventoryKind: request.inventoryKind ?? "document",
      format: request.format,
      title: request.title,
      uri: request.uri,
      mediaType: request.mediaType,
      ...(request.researchSourceKind ? { researchSourceKind: request.researchSourceKind } : {}),
      contentHash,
      byteLength: bytes.byteLength,
      immutable: true as const,
      createdAt: request.requestedAt
    });
    const stored = { asset, content: Uint8Array.from(bytes) };
    this.#records.set(id, stored);
    this.#versionIds.set(request.sourceId, versionIds.concat(id));
    return copyRecord(stored);
  }

  get(assetId: string): RawSourceRecord | undefined {
    const record = this.#records.get(assetId);
    return record ? copyRecord(record) : undefined;
  }

  listVersions(logicalSourceId: string): readonly KnowledgeSourceAsset[] {
    return Object.freeze((this.#versionIds.get(logicalSourceId) ?? [])
      .map((id) => this.#records.get(id)!.asset));
  }

  async verify(assetId: string): Promise<boolean> {
    const record = this.#records.get(assetId);
    if (!record) return false;
    return await sha256ContentHash(record.content) === record.asset.contentHash;
  }

  assertAnchorIntegrity(anchor: SourceAnchor): void {
    const record = this.#records.get(anchor.sourceId);
    if (!record) throw new Error(`Source anchor references unknown raw source version: ${anchor.sourceId}`);
    if (!anchor.contentHash) {
      throw new Error(`Source anchor ${anchor.id} is missing its immutable content hash`);
    }
    if (anchor.contentHash !== record.asset.contentHash) {
      throw new Error(
        `Source anchor ${anchor.id} hash does not match raw source version ${anchor.sourceId}`
      );
    }
  }
}

function toRawBytes(content: string | Uint8Array): Uint8Array {
  return typeof content === "string"
    ? new TextEncoder().encode(content)
    : Uint8Array.from(content);
}

function copyRecord(record: { asset: KnowledgeSourceAsset; content: Uint8Array }): RawSourceRecord {
  return { asset: record.asset, content: Uint8Array.from(record.content) };
}

function sameImmutableSource(
  asset: KnowledgeSourceAsset,
  request: IngestRequest,
  contentHash: string,
  byteLength: number
): boolean {
  return asset.spaceId === request.spaceId
    && asset.title === request.title
    && asset.uri === request.uri
    && (asset.inventoryKind ?? "document") === (request.inventoryKind ?? "document")
    && asset.format === request.format
    && asset.mediaType === request.mediaType
    && asset.researchSourceKind === request.researchSourceKind
    && asset.contentHash === contentHash
    && asset.byteLength === byteLength;
}

function validateRequest(request: IngestRequest): void {
  const required = [
    ["request id", request.id],
    ["project id", request.projectId],
    ["space id", request.spaceId],
    ["logical source id", request.sourceId],
    ["source title", request.title],
    ["source URI", request.uri]
  ] as const;
  for (const [name, value] of required) {
    if (!value.trim()) throw new Error(`${name} must not be empty`);
  }
  try {
    new URL(request.uri);
  } catch (error) {
    throw new Error(`Source URI must be absolute: ${request.uri}`, { cause: error });
  }
  if (!Number.isFinite(Date.parse(request.requestedAt))) {
    throw new Error(`requestedAt must be a valid timestamp: ${request.requestedAt}`);
  }
}
