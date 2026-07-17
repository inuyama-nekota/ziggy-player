const TIME_TAG = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const METADATA_TAG = /^\s*\[([a-zA-Z]+):(.*)\]\s*$/;

function fractionToMilliseconds(value = "") {
  if (!value) return 0;
  if (value.length === 1) return Number(value) * 100;
  if (value.length === 2) return Number(value) * 10;
  return Number(value.slice(0, 3));
}

export function parseLrc(source) {
  if (typeof source !== "string") {
    throw new TypeError("LRC data must be text.");
  }

  const metadata = {};
  const entries = [];
  let offset = 0;
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);

  for (const rawLine of lines) {
    const metadataMatch = rawLine.match(METADATA_TAG);
    if (metadataMatch && !/^\d+$/.test(metadataMatch[1])) {
      const key = metadataMatch[1].toLowerCase();
      const value = metadataMatch[2].trim();
      metadata[key] = value;
      if (key === "offset" && Number.isFinite(Number(value))) {
        offset = Number(value);
      }
      continue;
    }

    const timestamps = [...rawLine.matchAll(TIME_TAG)];
    if (timestamps.length === 0) continue;

    const text = rawLine
      .replace(TIME_TAG, "")
      .replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g, "")
      .trim();

    for (const match of timestamps) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      if (seconds >= 60) continue;
      const timeMs = minutes * 60_000 + seconds * 1_000 + fractionToMilliseconds(match[3]);
      entries.push({ timeMs, text });
    }
  }

  const adjusted = entries
    .map((entry) => ({ ...entry, timeMs: Math.max(0, entry.timeMs + offset) }))
    .sort((a, b) => a.timeMs - b.timeMs)
    .filter((entry, index, all) => index === 0 || entry.timeMs !== all[index - 1].timeMs || entry.text !== all[index - 1].text);

  if (adjusted.length === 0) {
    throw new Error("時刻付きの歌詞行が見つかりませんでした。");
  }

  return { metadata, entries: adjusted };
}

export function findLyricIndex(entries, timeMs) {
  let low = 0;
  let high = entries.length - 1;
  let answer = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (entries[middle].timeMs <= timeMs) {
      answer = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return answer;
}
