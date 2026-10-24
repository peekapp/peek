import { profileColors, type ProfileColor } from "@peek/core/colors";
import { profileName, type Profile } from "@peek/core/profiles";
import type { Locale } from "@peek/core/i18n";

/** The sole rendering of a profile identity, including previews and dashboard owners. */
export function ProfileIdentity({
  name,
  color,
}: {
  name: string;
  color: ProfileColor;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-foreground">
      <i
        className="size-2 shrink-0 rounded-full"
        aria-hidden="true"
        style={{ backgroundColor: profileColors[color] }}
      />
      <span className="min-w-0 wrap-anywhere">{name}</span>
    </span>
  );
}
export function ProfileLabel({
  profile,
  locale,
}: {
  profile: Profile;
  locale: Locale;
}) {
  return (
    <ProfileIdentity
      name={profileName(profile, locale)}
      color={profile.color}
    />
  );
}
