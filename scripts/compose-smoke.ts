export {};
// Run against a disposable Compose project, never a user's installation.
const base = process.env.PEEK_TEST_URL ?? "http://127.0.0.1:3100";
async function request(path: string, body?: unknown) {
  const response = await fetch(`${base}${path}`, {
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: base },
          body: JSON.stringify(body),
        }
      : {}),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
const id = "profile-compose-smoke";
if (process.argv[2] === "create") {
  await request("/api/settings", {
    action: "profile-save",
    id,
    config: { name: "Persistence check", color: "purple" },
  });
  const deadline = Date.now() + 40000;
  while (
    !(await request("/api/extensions")).packages.some(
      (p: { manifest: { id: string } }) => p.manifest.id === "peek/ical",
    )
  ) {
    if (Date.now() > deadline)
      throw new Error("Official packages not installed");
    await Bun.sleep(250);
  }
  await request("/api/extensions", {
    action: "save",
    instance: {
      packageId: "peek/ical",
      name: "Compose smoke",
      profileId: id,
      settings: { timeZone: "UTC", intervalSeconds: 60 },
      secrets: { url: "https://example.com/private.ics" },
      bindings: {},
      enabled: false,
    },
  });
} else {
  const state = await request("/api/screen");
  if (!state.heartbeat || Date.now() - state.heartbeat > 30000)
    throw new Error("Worker heartbeat missing");
  const settings = await request("/api/settings");
  if (
    !settings.profiles.some(
      (p: { id: string; color: string }) => p.id === id && p.color === "purple",
    )
  )
    throw new Error("Profile lost after restart");
  const status = await request("/api/extensions");
  const instance = status.instances.find(
    (i: { name: string }) => i.name === "Compose smoke",
  );
  if (!instance || !instance.hasSecret)
    throw new Error("Connection lost after restart");
  // Saving without secrets decrypts the saved credentials, including after restore.
  await request("/api/extensions", {
    action: "save",
    instance: {
      id: instance.id,
      packageId: instance.package_id,
      name: instance.name,
      profileId: id,
      settings: instance.settings,
      bindings: {},
      enabled: false,
    },
  });
  await request("/api/extensions", {
    action: "delete-instance",
    id: instance.id,
  });
  await request("/api/settings", { action: "profile-delete", id });
}
console.log("Compose smoke check passed.");
