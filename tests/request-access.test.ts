import { it } from "node:test";
import assert from "node:assert/strict";
import {
  allowedHostname,
  settingsRequestAllowed,
} from "../apps/web/lib/request-access";

it("accepts LAN addresses and explicit hostnames without arbitrary DNS hosts", () => {
  for (const host of [
    "localhost",
    "127.0.0.1",
    "[::1]",
    "192.168.1.42",
    "10.0.0.7",
    "172.16.0.1",
    "172.31.255.254",
    "[fd12::1]",
  ])
    assert.equal(allowedHostname(host, ""), true, host);
  for (const host of [
    "attacker.example",
    "192.168.1.42.attacker.example",
    "172.32.0.1",
    "8.8.8.8",
    "[2001:db8::1]",
  ])
    assert.equal(allowedHostname(host, ""), false, host);
  assert.equal(allowedHostname("peek.home", "peek.home, peek.local"), true);
  assert.equal(allowedHostname("other.peek.home", "peek.home"), false);
});
it("requires exact same-origin writes and rejects malformed hosts", () => {
  const request = (host: string, origin?: string) =>
    new Request("http://localhost:3000/api/settings", {
      headers: { host, ...(origin ? { origin } : {}) },
    });
  const host = "192.168.1.42:3000";
  assert.equal(settingsRequestAllowed(request(host)), true);
  assert.equal(
    settingsRequestAllowed(request(host, `http://${host}`), true),
    true,
  );
  assert.equal(
    settingsRequestAllowed(request(host, `https://${host}`), true),
    true,
  );
  for (const origin of [
    undefined,
    "null",
    "http://attacker.example",
    "http://192.168.1.42:4000",
    `http://${host}/path`,
    `ftp://${host}`,
  ])
    assert.equal(settingsRequestAllowed(request(host, origin), true), false);
  for (const invalid of [
    "user@192.168.1.42",
    "192.168.1.42/path",
    "attacker.example",
    "192.168.1.42#x",
  ])
    assert.equal(settingsRequestAllowed(request(invalid)), false);
});
