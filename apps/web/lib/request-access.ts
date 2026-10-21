import { isIP } from "node:net";
import { hostname, networkInterfaces } from "node:os";

/** Host validation prevents arbitrary DNS names from reaching the settings API.
 * This is a trusted-LAN deployment policy, not user authentication. */
export function allowedHostname(
  name: string,
  extraHosts = process.env.PEEK_ALLOWED_HOSTS ?? "",
) {
  if (["localhost", "127.0.0.1", "[::1]"].includes(name)) return true;
  if (extraHosts.split(",").some((host) => host.trim().toLowerCase() === name))
    return true;
  const address = name.startsWith("[") ? name.slice(1, -1) : name;
  const family = isIP(address);
  if (family === 4) {
    const [a, b] = address.split(".").map(Number);
    if (
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    )
      return true;
  }
  if (family === 6 && /^(fc|fd)[0-9a-f]{2}:/i.test(address)) return true;
  if (name === hostname().toLowerCase()) return true;
  return Object.values(networkInterfaces()).some((entries) =>
    entries?.some((entry) => entry.address.toLowerCase() === address),
  );
}

export function settingsRequestAllowed(request: Request, mutate = false) {
  const host = request.headers.get("host");
  if (!host) return false;
  try {
    const address = new URL(`http://${host}`);
    if (address.host !== host || !allowedHostname(address.hostname))
      return false;
    if (!mutate) return true;
    const origin = request.headers.get("origin");
    if (!origin) return false;
    const url = new URL(origin);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.host === host &&
      url.origin === origin
    );
  } catch {
    return false;
  }
}
