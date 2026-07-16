const localFileHeaderSignature = 0x04034b50;
const centralDirectoryHeaderSignature = 0x02014b50;
const endOfCentralDirectorySignature = 0x06054b50;
const utf8Flag = 0x0800;
const maxArchiveBytes = 64 * 1024 * 1024;
const maxEntryBytes = 8 * 1024 * 1024;
const maxEntryCount = 10_000;

export interface DeterministicZipEntry {
  path: string;
  content: Uint8Array;
}

/** Creates a deterministic, uncompressed ZIP readable by Obsidian and standard archive tools. */
export function encodeDeterministicZip(
  entries: readonly DeterministicZipEntry[],
  timestamp: string
): Uint8Array {
  const normalized = entries.map((entry) => ({
    path: validateZipPath(entry.path),
    name: new TextEncoder().encode(entry.path.replaceAll("\\", "/")),
    content: entry.content,
    crc: crc32(entry.content)
  })).sort((left, right) => compareText(left.path, right.path));
  if (new Set(normalized.map((entry) => entry.path)).size !== normalized.length) {
    throw new Error("Deterministic ZIP paths must be unique");
  }
  const { time, date } = dosDateTime(timestamp);
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  for (const entry of normalized) {
    const localHeader = new Uint8Array(30 + entry.name.length);
    const local = new DataView(localHeader.buffer);
    local.setUint32(0, localFileHeaderSignature, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, utf8Flag, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, entry.crc, true);
    local.setUint32(18, entry.content.length, true);
    local.setUint32(22, entry.content.length, true);
    local.setUint16(26, entry.name.length, true);
    local.setUint16(28, 0, true);
    localHeader.set(entry.name, 30);
    localParts.push(localHeader, entry.content);

    const centralHeader = new Uint8Array(46 + entry.name.length);
    const central = new DataView(centralHeader.buffer);
    central.setUint32(0, centralDirectoryHeaderSignature, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, utf8Flag, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, time, true);
    central.setUint16(14, date, true);
    central.setUint32(16, entry.crc, true);
    central.setUint32(20, entry.content.length, true);
    central.setUint32(24, entry.content.length, true);
    central.setUint16(28, entry.name.length, true);
    central.setUint16(30, 0, true);
    central.setUint16(32, 0, true);
    central.setUint16(34, 0, true);
    central.setUint16(36, 0, true);
    central.setUint32(38, 0, true);
    central.setUint32(42, localOffset, true);
    centralHeader.set(entry.name, 46);
    centralParts.push(centralHeader);
    localOffset += localHeader.length + entry.content.length;
  }
  const centralSize = totalLength(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, endOfCentralDirectorySignature, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, normalized.length, true);
  endView.setUint16(10, normalized.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localOffset, true);
  endView.setUint16(20, 0, true);
  return concatBytes([...localParts, ...centralParts, end]);
}

export function decodeDeterministicZip(bytes: Uint8Array): DeterministicZipEntry[] {
  if (bytes.length < 22) throw new Error("ZIP archive is truncated");
  if (bytes.length > maxArchiveBytes) throw new Error("ZIP archive exceeds the 64 MiB import budget");
  const endOffset = findEndOfCentralDirectory(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entryCount = view.getUint16(endOffset + 10, true);
  if (entryCount > maxEntryCount) throw new Error("ZIP archive contains too many entries");
  const centralOffset = view.getUint32(endOffset + 16, true);
  if (centralOffset >= endOffset) throw new Error("ZIP central directory offset is invalid");
  const entries: DeterministicZipEntry[] = [];
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== centralDirectoryHeaderSignature) throw new Error("ZIP central directory is invalid");
    const method = view.getUint16(offset + 10, true);
    if (method !== 0) throw new Error("ZIP archive uses unsupported compression; expected stored entries");
    const expectedCrc = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    if (uncompressedSize > maxEntryBytes) throw new Error("ZIP entry exceeds the 8 MiB import budget");
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const path = validateZipPath(new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength)));
    if (view.getUint32(localOffset, true) !== localFileHeaderSignature) throw new Error(`ZIP local header is invalid: ${path}`);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const contentOffset = localOffset + 30 + localNameLength + localExtraLength;
    if (compressedSize !== uncompressedSize || contentOffset + uncompressedSize > bytes.length) {
      throw new Error(`ZIP entry is truncated or compressed: ${path}`);
    }
    const content = bytes.slice(contentOffset, contentOffset + uncompressedSize);
    if (crc32(content) !== expectedCrc) throw new Error(`ZIP CRC mismatch: ${path}`);
    entries.push({ path, content });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (new Set(entries.map((entry) => entry.path)).size !== entries.length) throw new Error("ZIP archive contains duplicate paths");
  return entries.sort((left, right) => compareText(left.path, right.path));
}

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function validateZipPath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (!normalized || normalized.length > 512 || normalized.startsWith("/") || normalized.includes(":")
    || normalized.includes("\u0000") || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`ZIP path is unsafe: ${path}`);
  }
  return normalized;
}

function dosDateTime(value: string): { time: number; date: number } {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("ZIP timestamp must be a valid ISO timestamp");
  const year = Math.min(2107, Math.max(1980, parsed.getUTCFullYear()));
  const time = (parsed.getUTCHours() << 11) | (parsed.getUTCMinutes() << 5) | Math.floor(parsed.getUTCSeconds() / 2);
  const date = ((year - 1980) << 9) | ((parsed.getUTCMonth() + 1) << 5) | parsed.getUTCDate();
  return { time, date };
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset -= 1) {
    if (view.getUint32(offset, true) === endOfCentralDirectorySignature) return offset;
  }
  throw new Error("ZIP end-of-central-directory record is missing");
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(totalLength(parts));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function totalLength(parts: readonly Uint8Array[]): number {
  return parts.reduce((total, part) => total + part.length, 0);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
