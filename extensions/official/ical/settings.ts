export function validateCalendarUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 4096)
    throw new Error("invalid-url");
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      (url.port && url.port !== "443")
    )
      throw new Error();
    return url.href;
  } catch {
    throw new Error("invalid-url");
  }
}
