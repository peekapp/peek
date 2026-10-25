import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import type { CSSProperties } from "react";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { profileInitials } from "../lib/profile-initials";
import { profileColors, type ProfileColor } from "@peek/core/colors";
import { profileName, type Profile } from "@peek/core/profiles";
import type { Locale } from "@peek/core/i18n";

const nameVariants = cva("min-w-0 wrap-anywhere", {
  variants: { avatarOnly: { true: "sr-only", false: "" } },
});

/** The sole rendering of a profile identity, including previews and dashboard owners. */
export function ProfileIdentity({
  name,
  color,
  avatarOnly = false,
}: {
  name: string;
  color: ProfileColor;
  avatarOnly?: boolean;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-foreground">
      <Avatar
        size="sm"
        aria-hidden="true"
        style={{ "--profile-color": profileColors[color] } as CSSProperties}
      >
        <AvatarFallback variant="profile">
          {profileInitials(name)}
        </AvatarFallback>
      </Avatar>
      <span className={cn(nameVariants({ avatarOnly }))}>{name}</span>
    </span>
  );
}
export function ProfileLabel({
  profile,
  locale,
  avatarOnly = false,
}: {
  profile: Profile;
  locale: Locale;
  avatarOnly?: boolean;
}) {
  const identity = (
    <ProfileIdentity
      name={profileName(profile, locale)}
      color={profile.color}
      avatarOnly={avatarOnly}
    />
  );
  return avatarOnly ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="relative z-10 inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {identity}
        </span>
      </TooltipTrigger>
      <TooltipContent>{profileName(profile, locale)}</TooltipContent>
    </Tooltip>
  ) : (
    identity
  );
}
