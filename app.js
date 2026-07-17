import assert from "node:assert/strict";
import test from "node:test";

import { findLyricIndex, parseLrc } from "../lrc-parser.js";

test("metadata and normal timestamps are parsed", () => {
  const result = parseLrc("[ar:ZIGGY]\n[ti:TEST]\n[00:12.50]first\n[00:18.2]second");
  assert.equal(result.metadata.ar, "ZIGGY");
  assert.equal(result.entries.length, 2);
  assert.deepEqual(result.entries[0], { timeMs: 12_500, text: "first" });
  assert.deepEqual(result.entries[1], { timeMs: 18_200, text: "second" });
});

test("offset and multiple time tags are supported", () => {
  const result = parseLrc("[offset:250]\n[00:01.00][00:03.000]repeat");
  assert.deepEqual(result.entries, [
    { timeMs: 1_250, text: "repeat" },
    { timeMs: 3_250, text: "repeat" },
  ]);
});

test("lyric index stays before the first line and advances by time", () => {
  const entries = parseLrc("[00:05.00]one\n[00:10.00]two\n[00:15.00]three").entries;
  assert.equal(findLyricIndex(entries, 0), -1);
  assert.equal(findLyricIndex(entries, 5_000), 0);
  assert.equal(findLyricIndex(entries, 14_999), 1);
  assert.equal(findLyricIndex(entries, 99_000), 2);
});

test("invalid files produce a readable error", () => {
  assert.throws(() => parseLrc("plain text only"), /時刻付き/);
});
