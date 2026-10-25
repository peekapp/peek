import { isProfileColor } from "./colors";
import type { Owner } from "./cards";
import { messages, type Locale } from "./i18n";
export type Profile = {
  id: string;
  name: string;
  color: Owner["color"];
  system: boolean;
};
export function profileName(profile: Profile, locale: Locale) {
  return profile.system ? messages(locale).sharedProfile : profile.name;
}
export function validateProfile(
  input: unknown,
): Pick<Profile, "name" | "color"> {
  const value = input as Profile | null;
  if (
    !value ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name.length > 100 ||
    !isProfileColor(value.color)
  )
    throw new Error("invalid-profile");
  return { name: value.name.trim(), color: value.color };
}
