import { databasePath } from "@peek/db";
import { openExtensions } from "@peek/extensions/store";
import { decode } from "@peek/extensions/archive";
import { dependencies, downloadPackage } from "@peek/extensions/download";
import { LIMITS } from "@peek/extensions/validation";
import { settingsRequestAllowed } from "../../../lib/request-access";
export const dynamic = "force-dynamic";
async function boundedBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("empty-body");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > LIMITS.archive) throw new Error("request-too-large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}
export function GET(request: Request) {
  if (!settingsRequestAllowed(request))
    return new Response(null, { status: 403 });
  try {
    const store = openExtensions(databasePath());
    try {
      return Response.json(store.status(), {
        headers: { "Cache-Control": "no-store" },
      });
    } finally {
      store.close();
    }
  } catch {
    return Response.json({ error: "extensions-unavailable" }, { status: 503 });
  }
}
export async function POST(request: Request) {
  if (!settingsRequestAllowed(request, true))
    return new Response(null, { status: 403 });
  let store: ReturnType<typeof openExtensions> | undefined;
  try {
    const raw = await boundedBody(request);
    store = openExtensions(databasePath());
    const type = request.headers.get("content-type") ?? "";
    if (type.startsWith("application/octet-stream")) {
      const initial = decode(raw).packages;
      const packages = await dependencies(
        initial,
        store.installed().map((p) => JSON.parse(p.payload)),
      );
      const dependencyIds = new Set(
        packages.flatMap((p) =>
          (p.manifest.dependencies ?? []).map((d) => d.id),
        ),
      );
      return Response.json(
        store.stage(
          packages,
          initial
            .filter((p) => !dependencyIds.has(p.manifest.id))
            .map((p) => p.manifest.id),
        ),
      );
    }
    if (!type.startsWith("application/json"))
      return new Response(null, { status: 415 });
    const body = JSON.parse(raw.toString());
    if (body.action === "download") {
      const initial = decode(await downloadPackage(body.url)).packages;
      const packages = await dependencies(
        initial,
        store.installed().map((p) => JSON.parse(p.payload)),
      );
      const deps = new Set(
        packages.flatMap((p) =>
          (p.manifest.dependencies ?? []).map((d) => d.id),
        ),
      );
      return Response.json(
        store.stage(
          packages,
          initial
            .filter((p) => !deps.has(p.manifest.id))
            .map((p) => p.manifest.id),
        ),
      );
    }
    if (body.action === "confirm") store.confirm(body.id);
    else if (body.action === "cancel") store.cancel(body.id);
    else if (body.action === "save")
      return Response.json({ id: store.save(body.instance) });
    else if (body.action === "run") store.requestRun(body.id);
    else if (body.action === "delete-instance") store.removeInstance(body.id);
    else if (body.action === "delete-package") store.removePackage(body.id);
    else if (body.action === "rollback") store.rollback();
    else throw new Error("unknown-action");
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid-request";
    return Response.json(
      { error: message.length < 200 ? message : "invalid-request" },
      { status: 400 },
    );
  } finally {
    store?.close();
  }
}
