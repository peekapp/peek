import { expect, test } from "bun:test";
import { profileInitials } from "../apps/web/lib/profile-initials";

test("profile initials use the first and last name, preserving Unicode graphemes", () => {
  for (const [name, initials] of [
    ["Tim", "T"],
    ["Ada Lovelace", "AL"],
    ["Ada Byron Lovelace", "AL"],
    ["  анна\tмария\nиванова  ", "АИ"],
    ["e\u0301mile Zola", "E\u0301Z"],
    ["👩‍💻 Developer", "👩‍💻D"],
    ["", "?"],
    [" \t\n", "?"],
  ]) {
    expect(profileInitials(name)).toBe(initials);
  }
});
