import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { compatible } from "../packages/extensions/src/compatibility";
import { compatible as serverCompatible } from "../packages/extensions/src/validation";

test("browser and server share connection version compatibility", () => {
  expect(compatible).toBe(serverCompatible);
  expect(compatible("1.5.0", "^2.0.0")).toBe(false);
  expect(compatible("2.3.0", "^2.0.0")).toBe(true);
  expect(compatible("3.0.0", "^2.0.0")).toBe(false);
});

test("destructive labels meet normal-text contrast in every palette and hover state", () => {
  const css = readFileSync(
    new URL("../apps/web/app/globals.css", import.meta.url),
    "utf8",
  );
  const rgb = (hex: string) =>
    [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const luminance = (channels: number[]) =>
    channels
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
      .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  const contrast = (a: number[], b: number[]) => {
    const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y);
    return (high + 0.05) / (low + 0.05);
  };
  const palettes = [...css.matchAll(/\[data-theme="([^"]+)"\]\s*\{([^}]+)\}/g)];
  expect(palettes.length).toBe(11);
  for (const [, , body] of palettes) {
    const color = (name: string) =>
      rgb(body.match(new RegExp(`--${name}: (#[0-9a-f]{6});`))![1]);
    const destructive = rgb(
      css.match(/--color-destructive-background: (#[0-9a-f]{6});/)![1],
    );
    for (const backdrop of [color("background"), color("ui-card")]) {
      const hover = destructive.map((c, i) => c * 0.9 + backdrop[i] * 0.1);
      expect(contrast(rgb("#ffffff"), destructive)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(rgb("#ffffff"), hover)).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(color("ui-status-error-foreground"), backdrop),
      ).toBeGreaterThanOrEqual(4.5);
    }
  }
});
