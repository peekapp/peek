import type { Json } from "@peekapp/sdk";

export function numericSetting(
  settings: Record<string, Json>,
  key: string,
  text: string,
): Record<string, Json> {
  const next = { ...settings };
  if (text === "") delete next[key];
  else next[key] = Number(text);
  return next;
}
