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
  // A secret ensures the key file is exercised by the persistence check too.
  await request("/api/settings", {
    action: "calendar-save",
    id: "cal-compose-smoke",
    config: {
      name: "Smoke",
      profileId: id,
      timeZone: "UTC",
      intervalSeconds: 60,
    },
    url: "https://127.0.0.1/test.ics",
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
  await request("/api/settings", {
    action: "calendar-save",
    id: "cal-compose-smoke",
    config: {
      name: "Smoke",
      profileId: id,
      timeZone: "UTC",
      intervalSeconds: 60,
    },
  });
  await request("/api/settings", {
    action: "calendar-delete",
    id: "cal-compose-smoke",
  });
  await request("/api/settings", { action: "profile-delete", id });
}
console.log("Compose smoke check passed.");
