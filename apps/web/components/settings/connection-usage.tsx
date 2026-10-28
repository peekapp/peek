import Link from "next/link";
import { toast } from "sonner";
import { UnplugIcon } from "lucide-react";
import { Button } from "../ui/button";
import { ConfirmAction } from "./delete-button";
import { useId, useState } from "react";
import { messages, type Locale } from "@peek/core/i18n";
import type { Profile } from "@peek/core/profiles";
import { ExtensionLabel } from "../extension-icon";
import { ProfileLabel } from "../profile-label";
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "../ui/item";
import { Separator } from "../ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { connectionScenarios } from "./connection-bindings";
import type { Status } from "./extensions";

export function ConnectionUsage({ connectionId, instances, packages, profiles, locale, onDisconnect }: {
  connectionId: string;
  instances: Status["instances"];
  packages: Status["packages"];
  profiles: Profile[] | null;
  locale: Locale;
  onDisconnect: (scenarioId: string, disable: boolean) => Promise<() => Promise<void>>;
}) {
  const t = messages(locale);
  const headingId = useId();
  const [pending, setPending] = useState(false);
  async function disconnect(scenarioId: string, disable: boolean) {
    setPending(true);
    try {
      const undo = await onDisconnect(scenarioId, disable);
      toast.success(t.scenarioDisconnected, { action: { label: t.undo, onClick: () => {
        void undo().then(() => toast.success(t.connectionRestored)).catch((error) => {
          toast.error(error instanceof Error && error.message === "scenario-changed" ? t.disconnectUndoChanged : t.disconnectUndoFailed);
        });
      } } });
    } catch (error) {
      throw new Error(error instanceof Error && error.message === "connection-required" ? t.disconnectRequired : t.actionFailed);
    } finally { setPending(false); }
  }
  const scenarios = connectionScenarios(instances, connectionId)
    .sort((a, b) => a.name.localeCompare(b.name, locale));

  return <>
    <Separator />
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-2">
    <h4 id={headingId} className="text-sm font-medium">{t.connectionUsedBy}</h4>
    {scenarios.length ? <ItemGroup>
      {scenarios.map((scenario) => {
        const pkg = packages.find((pkg) => pkg.manifest.id === scenario.package_id);
        const profile = profiles?.find((profile) => profile.id === scenario.profile_id);
        const requiresDisable = !!scenario.enabled && Object.entries(pkg?.manifest.inputs ?? {}).some(([input, requirement]) =>
          !requirement.optional && !(scenario.bindings[input] ?? []).some((binding) => binding.connectionId !== connectionId));
        const trigger = <TooltipTrigger asChild>
          <Button type="button" variant="destructive-ghost" size="icon-sm" disabled={pending}
            aria-label={`${t.disconnect}: ${scenario.name}`}
            onClick={requiresDisable ? undefined : () => { void disconnect(scenario.id, false).catch((error) => toast.error(error.message)); }}>
            <UnplugIcon />
          </Button>
        </TooltipTrigger>;
        return <Item key={scenario.id} role="listitem" size="sm" className="relative">
          <ItemContent>
            <ItemTitle>
              <Link href={`/scenarios/${encodeURIComponent(scenario.id)}`}
                className="min-w-0 rounded-sm after:absolute after:inset-0 after:rounded-md hover:underline focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">
                <ExtensionLabel kind="scenario" src={pkg?.iconDataUrl} color={pkg?.manifest.iconColor}>
                  {scenario.name}
                </ExtensionLabel>
              </Link>
            </ItemTitle>
          </ItemContent>
          <ItemActions className="relative z-10">
            {profile ? <ProfileLabel profile={profile} locale={locale} avatarOnly /> : null}
            <Tooltip>
              {requiresDisable ? <ConfirmAction locale={locale} label={t.disableAndDisconnect}
                description={t.disconnectDisableConfirm.replace("{name}", scenario.name)}
                warning={{ title: t.disconnectDisableWarning, description: t.disconnectDisableConsequence }}
                trigger={trigger} onConfirm={() => disconnect(scenario.id, true)} /> : trigger}
              <TooltipContent>{t.disconnect}</TooltipContent>
            </Tooltip>
          </ItemActions>
        </Item>;
      })}
    </ItemGroup> : <p className="text-sm text-muted-foreground">{t.connectionUnused}</p>}
    </section>
  </>;
}
