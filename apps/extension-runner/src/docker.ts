import { networkInterfaces } from "node:os";
import { spawn } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import type { ExtensionPackage } from "@peek/extensions";
import { LIMITS, boundedJson } from "@peek/extensions";
const NAMESPACE =
  process.env.PEEK_RUNNER_NAMESPACE ??
  createHash("sha256").update(process.cwd()).digest("hex").slice(0, 16);
const IMAGE = process.env.PEEK_EXTENSION_IMAGE ?? "peek-extension:local";
const GATEWAY =
  process.env.PEEK_GATEWAY_IMAGE ?? "peek-extension-gateway:local";
export async function docker(args: string[], timeout = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
    let text = "";
    const timer = setTimeout(() => proc.kill("SIGKILL"), timeout);
    proc.stdout.on("data", (b) => {
      text += b;
      if (text.length > 2_000_000) proc.kill("SIGKILL");
    });
    proc.stderr.resume();
    proc.once("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    proc.once("close", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve(text.trim())
        : reject(new Error("container-command-failed"));
    });
  });
}
export async function readiness() {
  const info = JSON.parse(await docker(["info", "--format", "{{json .}}"]));
  if (
    info.OSType !== "linux" ||
    !info.MemoryLimit ||
    !info.PidsLimit ||
    !info.CpuCfsQuota ||
    !info.SecurityOptions?.some((x: string) => x.includes("seccomp"))
  )
    throw new Error("container-isolation-unavailable");
  await docker(["image", "inspect", IMAGE, GATEWAY]);
}
const base = [
  "--label",
  `peek.extension=${NAMESPACE}`,
  "--read-only",
  "--cap-drop=ALL",
  "--security-opt",
  "no-new-privileges:true",
  "--restart=no",
];
export type Run = { stop(): Promise<void>; done: Promise<void> };
export async function runContainer(
  p: ExtensionPackage,
  context: unknown,
  onResult: (value: any) => void,
  action = "run",
): Promise<Run> {
  boundedJson(context, LIMITS.message);
  const name = `peek-ext-${randomUUID()}`,
    gateway = `${name}-net`;
  const integration = p.manifest.kind === "integration" && action !== "migrate";
  let hasGateway = false;
  const stop = async () => {
    await docker(["rm", "-f", name]).catch(() => {});
    if (hasGateway) await docker(["rm", "-f", gateway]).catch(() => {});
  };
  try {
    let network = "none";
    if (
      integration &&
      (p.manifest.permissions.internet || p.manifest.permissions.local?.length)
    ) {
      const networkIds = (await docker(["network", "ls", "-q"]))
        .split(/\s+/)
        .filter(Boolean);
      const protectedNetworks = networkIds.length
        ? JSON.parse(
            await docker(["network", "inspect", ...networkIds]),
          ).flatMap((n: any) =>
            (n.IPAM?.Config ?? [])
              .map((c: any) => c.Subnet)
              .filter((s: string) => s && !s.includes(":")),
          )
        : [];
      // Block the actual Docker host addresses as well as application subnets,
      // including when an author asks for an explicit LAN exception.
      const hostAddresses = await docker([
        "run",
        "--rm",
        "--network=host",
        "--read-only",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges:true",
        "--entrypoint=ip",
        GATEWAY,
        "-o",
        "-4",
        "addr",
        "show",
      ]);
      for (const match of hostAddresses.matchAll(
        /inet (\d+\.\d+\.\d+\.\d+)\//g,
      ))
        protectedNetworks.push(`${match[1]}/32`);
      for (const entries of Object.values(networkInterfaces()))
        for (const address of entries ?? [])
          if (address.family === "IPv4")
            protectedNetworks.push(`${address.address}/32`);
      const local = p.manifest.permissions.local ?? [];
      if (local.some((x) => x.address.includes(":")))
        throw new Error("ipv6-local-grants-not-supported");
      await docker([
        "run",
        "-d",
        "--name",
        gateway,
        ...base,
        "--cap-add=NET_ADMIN",
        "--memory=32m",
        "--pids-limit=16",
        "--cpus=0.1",
        "--dns=1.1.1.1",
        "--env",
        `INTERNET=${p.manifest.permissions.internet ? 1 : 0}`,
        "--env",
        `LOCAL_ENDPOINTS=${local.map((x) => `${x.address}:${x.port}`).join(" ")}`,
        "--env",
        `PROTECTED_NETWORKS=${protectedNetworks.join(" ")}`,
        GATEWAY,
      ]);
      hasGateway = true;
      const deadline = Date.now() + 5000;
      while (!(await docker(["logs", gateway])).includes("ready")) {
        if (Date.now() > deadline) throw new Error("firewall-unavailable");
        await new Promise((r) => setTimeout(r, 100));
      }
      network = `container:${gateway}`;
    }
    await docker([
      "create",
      "--name",
      name,
      ...base,
      "--log-driver=none",
      "--network",
      network,
      "--user=1000:1000",
      `--memory=${integration ? 512 : 128}m`,
      `--memory-swap=${integration ? 512 : 128}m`,
      `--pids-limit=${integration ? 64 : 32}`,
      "--cpus=0.5",
      "--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=32m,uid=1000,gid=1000",
      "-i",
      IMAGE,
    ]);
    const proc = spawn("docker", ["start", "-a", "-i", name], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const request =
      JSON.stringify({
        files: p.files,
        kind: p.manifest.kind,
        context,
        action,
      }) + "\n";
    let buffer = Buffer.alloc(0),
      failed = false,
      count = 0,
      last = 0;
    const done = new Promise<void>((resolve, reject) => {
      const timer = integration
        ? undefined
        : setTimeout(() => {
            failed = true;
            void stop();
          }, 10000);
      const fail = () => {
        failed = true;
        void stop();
      };
      proc.stdout.on("data", (chunk) => {
        if (failed) return;
        buffer = Buffer.concat([buffer, chunk]);
        if (buffer.length > LIMITS.message) {
          fail();
          return;
        }
        let at: number;
        while ((at = buffer.indexOf(10)) >= 0) {
          const line = buffer.subarray(0, at);
          buffer = buffer.subarray(at + 1);
          try {
            if (Date.now() - last < 100)
              throw new Error("publication-rate-exceeded");
            last = Date.now();
            const msg = JSON.parse(line.toString());
            if (msg.type !== (action === "migrate" ? "migration" : "result"))
              throw new Error("invalid-protocol");
            if (!integration && count) throw new Error("multiple-results");
            count++;
            onResult(msg.result);
          } catch {
            fail();
            return;
          }
        }
      });
      // Discard extension stderr: it may contain secrets. Report bounded host error codes only.
      proc.stderr.resume();
      proc.stdin.on("error", () => {});
      proc.once("error", () => {
        if (timer) clearTimeout(timer);
        void stop().then(() => reject(new Error("execution-failed")));
      });
      proc.once("close", (code) => {
        if (timer) clearTimeout(timer);
        void stop().then(() =>
          code === 0 && !failed && count > 0
            ? resolve()
            : reject(new Error("execution-failed")),
        );
      });
    });
    proc.stdin.end(request);
    return { stop, done };
  } catch (error) {
    await stop();
    throw error;
  }
}
export async function cleanup() {
  const ids = (
    await docker(["ps", "-aq", "--filter", `label=peek.extension=${NAMESPACE}`])
  )
    .split(/\s+/)
    .filter(Boolean);
  if (ids.length) await docker(["rm", "-f", ...ids]);
}
