import { expect, test } from "bun:test";
import type { Manifest } from "@peekapp/sdk";
import scenarioManifest from "../extensions/official/meetings/peek.json";
import connectionManifest from "../extensions/official/ical/peek.json";
import { compatiblePackages, connectionInputs, selectBinding } from "../apps/web/components/settings/connection-bindings";

const manifest = scenarioManifest as Manifest;
const producer = connectionManifest as Manifest;
const contract = producer.provides!.events;
const packages = (manifests: Manifest[]) => manifests.map((manifest) => ({ manifest, iconDataUrl: null, explicit: true, unused: false, official: true }));
test("creation and selection agree on compatible datasets and retain paused choices", () => {
  const incompatible = { ...producer, id: "test/incompatible", provides: { events: { ...contract, version: "99.0.0" } } };
  expect(compatiblePackages(manifest, "events", packages([producer, incompatible, manifest])).map((p) => p.manifest.id)).toEqual([producer.id]);
  expect(compatiblePackages(manifest, "missing", packages([producer]))).toEqual([]);
  const inputs = connectionInputs(manifest, [
    { id: "paused", name: "Calendar", enabled: false, contracts: { events: contract, second: contract } },
    { id: "wrong", name: "Wrong", enabled: true, contracts: incompatible.provides },
  ]);
  expect(inputs[0].choices.map((c) => [c.connectionId, c.dataset, c.enabled])).toEqual([
    ["paused", "events", false], ["paused", "second", false],
  ]);
});
test("binding selection replaces single, appends multiple, removes and deduplicates without metadata", () => {
  const a = { connectionId: "a", dataset: "events" };
  const b = { connectionId: "b", dataset: "events", name: "Do not persist" };
  expect(selectBinding([a], b, true, false)).toEqual([{ connectionId: "b", dataset: "events" }]);
  expect(selectBinding([a], b, true, true)).toEqual([a, { connectionId: "b", dataset: "events" }]);
  expect(selectBinding([a], a, true, true)).toEqual([a]);
  expect(selectBinding([a], a, false, false)).toEqual([]);
  expect(selectBinding([a, b], b, false, true)).toEqual([a]);
});
