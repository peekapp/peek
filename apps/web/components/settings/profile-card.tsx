import Link from "next/link";
import type { ReactNode } from "react";
import type { Profile } from "@peek/core/profiles";
import { messages, type Locale } from "@peek/core/i18n";
import { ProfileLabel } from "../profile-label";
import { Plug, Workflow } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { Card } from "../ui/card";

export function ProfileCard({ profile, connectionCount, scenarioCount, locale, actions }: {
  profile: Profile;
  connectionCount: number;
  scenarioCount: number;
  locale: Locale;
  actions: ReactNode;
}) {
  const t = messages(locale);
  return (
    <Card variant="profile">
      <div className="absolute top-2 right-2 z-10">{actions}</div>
      <Link className="mt-2 after:absolute after:inset-0 focus-visible:outline-none" href={`/profiles/${profile.id}`}>
        <ProfileLabel profile={profile} locale={locale} layout="card" />
      </Link>
      <div className="mt-auto flex justify-center gap-4 pt-3 text-sm tabular-nums text-muted-foreground">
        {[
          { label: t.connections, count: connectionCount, Icon: Plug },
          { label: t.scenarios, count: scenarioCount, Icon: Workflow },
        ].map(({ label, count, Icon }) => (
          <Tooltip key={label}>
            <TooltipTrigger asChild>
              <Link href={`/profiles/${profile.id}`} className="relative z-10 inline-flex items-center gap-1.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${label}: ${count}`}>
                <Icon className="size-4" aria-hidden="true" />{count}
              </Link>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </Card>
  );
}
