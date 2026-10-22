import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { validateCalendarUrl } from "./settings";
export const MAX_BYTES = 10 * 1024 * 1024;
export function publicAddress(address: string) {
  try {
    const value = ipaddr.process(address);
    return value.range() === "unicast";
  } catch {
    return false;
  }
}
export async function resolvePublic(host: string, resolver = lookup) {
  const name = host.replace(/^\[|\]$/g, "");
  const addresses = isIP(name)
    ? [{ address: name, family: isIP(name) }]
    : await resolver(name, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new Error("blocked-address");
  return addresses[0];
}
export type Download = {
  status: number;
  body: string;
  etag?: string;
  modified?: string;
  location?: string;
};
// Validate every DNS result, then pin the actual TLS connection to a vetted IP.
// Keep the original hostname for SNI and certificate verification.
async function hop(
  url: URL,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<Download> {
  const address = await resolvePublic(url.hostname);
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        signal,
        agent: false,
        headers: {
          Accept: "text/calendar",
          "Accept-Encoding": "identity",
          ...headers,
        },
        lookup: (_hostname, options, callback) => {
          if (typeof options === "object" && options.all)
            callback(null, [address] as never);
          else callback(null, address.address, address.family);
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const meta = {
          status,
          etag: res.headers.etag,
          modified: res.headers["last-modified"],
          location: res.headers.location,
        };
        if (status === 304 || (status >= 300 && status < 400)) {
          res.resume();
          resolve({ ...meta, body: "" });
          return;
        }
        if (status !== 200) {
          res.destroy();
          reject(new Error("http-error"));
          return;
        }
        if (
          res.headers["content-encoding"] &&
          res.headers["content-encoding"] !== "identity"
        ) {
          res.destroy();
          reject(new Error("invalid-calendar"));
          return;
        }
        if (Number(res.headers["content-length"]) > MAX_BYTES) {
          res.destroy();
          reject(new Error("too-large"));
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            res.destroy();
            reject(new Error("too-large"));
          } else chunks.push(Buffer.from(chunk));
        });
        res.on("end", () =>
          resolve({ ...meta, body: Buffer.concat(chunks).toString("utf8") }),
        );
        res.on("error", () => reject(new Error("network-error")));
      },
    );
    req.on("error", () =>
      reject(new Error(signal.aborted ? "timeout" : "network-error")),
    );
    req.end();
  });
}
export async function fetchCalendar(
  url: string,
  headers: Record<string, string> = {},
  transport = hop,
  abort?: AbortSignal,
): Promise<Download> {
  const signal = AbortSignal.any([
    AbortSignal.timeout(15000),
    ...(abort ? [abort] : []),
  ]);
  signal.throwIfAborted();
  // DNS resolution is also covered by this deadline.
  async function download() {
    let target = validateCalendarUrl(url);
    for (let redirects = 0; redirects <= 4; redirects++) {
      const result = await transport(new URL(target), headers, signal);
      if (result.status === 200 || result.status === 304) return result;
      if (
        !result.location ||
        ![301, 302, 303, 307, 308].includes(result.status)
      )
        throw new Error("http-error");
      target = validateCalendarUrl(new URL(result.location, target).href);
    }
    throw new Error("redirect-limit");
  }
  return Promise.race([
    download(),
    new Promise<never>((_, reject) =>
      signal.addEventListener("abort", () => reject(new Error("timeout")), {
        once: true,
      }),
    ),
  ]);
}
