import type { CSSProperties } from "react";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { profileInitials } from "../lib/profile-initials";
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
      <Avatar
        size="sm"
        aria-hidden="true"
        style={{ "--profile-color": profileColors[color] } as CSSProperties}
      >
        <AvatarFallback variant="profile">{profileInitials(name)}</AvatarFallback>
      </Avatar>
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
