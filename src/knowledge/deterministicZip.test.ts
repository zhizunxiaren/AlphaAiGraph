// @vitest-environment node

import { expect, test } from "vitest";
import { decodeDeterministicZip, encodeDeterministicZip } from "./deterministicZip";

test("encodes a deterministic stored ZIP and validates CRC on decode", () => {
  const entries = [
    { path: "Vault/Nodes/b.md", content: new TextEncoder().encode("B") },
    { path: "Vault/Index.md", content: new TextEncoder().encode("# Index") }
  ];
  const first = encodeDeterministicZip(entries, "2026-07-15T12:00:00.000Z");
  const second = encodeDeterministicZip(entries.slice().reverse(), "2026-07-15T12:00:00.000Z");

  expect(second).toEqual(first);
  expect(decodeDeterministicZip(first)).toEqual(entries.slice().sort((left, right) => left.path.localeCompare(right.path)));
  const corrupted = first.slice();
  const firstNameLength = new DataView(corrupted.buffer).getUint16(26, true);
  corrupted[30 + firstNameLength] ^= 0xff;
  expect(() => decodeDeterministicZip(corrupted)).toThrow(/CRC mismatch/);
});

test("rejects unsafe paths and compressed archives", () => {
  expect(() => encodeDeterministicZip([
    { path: "../secret.md", content: new Uint8Array() }
  ], "2026-07-15T12:00:00.000Z")).toThrow(/unsafe/);
});
