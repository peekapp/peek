const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function profileInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const ends = parts.length === 1 ? parts : [parts[0], parts[parts.length - 1]];
  return ends
    .map((part) => graphemes.segment(part)[Symbol.iterator]().next().value!.segment)
    .join("")
    .toUpperCase();
}
