import { expect, test } from "bun:test";
import { numericSetting } from "../apps/web/components/settings/numeric-setting";
import { validate } from "../packages/extensions/src/validation";

test("clearing an optional number omits it from saved settings", () => {
  for (const type of ["integer", "number"]) {
    const schema = { type: "object", properties: { limit: { type } } };
    const original = { limit: 5, title: "Keep me" };
    const cleared = numericSetting(original, "limit", "");
    expect(cleared).toEqual({ title: "Keep me" });
    expect(original.limit).toBe(5);
    expect(() =>
      validate(schema, JSON.parse(JSON.stringify(cleared))),
    ).not.toThrow();
    expect(() => validate({ ...schema, required: ["limit"] }, cleared)).toThrow();
    expect(numericSetting(cleared, "limit", "0").limit).toBe(0);
    expect(numericSetting(cleared, "limit", "2.5").limit).toBe(2.5);
  }
});
