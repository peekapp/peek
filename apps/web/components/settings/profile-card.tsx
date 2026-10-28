import Link from "next/link";
import type { ReactNode } from "react";
import type { Profile } from "@peek/core/profiles";
import type { Locale } from "@peek/core/i18n";
import { ProfileLabel } from "../profile-label";
import { ProfileUsage, type ProfileUsageData } from "./profile-usage";
import { Card } from "../ui/card";

export function ProfileCard({ profile, usage, locale, actions }: {
  profile: Profile;
  usage: ProfileUsageData;
  locale: Locale;
  actions: ReactNode;
}) {
  return (
    <Card variant="profile">
      <div className="absolute top-2 right-2 z-10">{actions}</div>
      <Link className="mt-2 after:absolute after:inset-0 focus-visible:outline-none" href={`/profiles/${profile.id}`}>
        <ProfileLabel linked={false} profile={profile} locale={locale} layout="card" />
      </Link>
      <ProfileUsage profileId={profile.id} data={usage} locale={locale} variant="counts" />
    </Card>
  );
}
