import { toast } from "sonner";
import { UnplugIcon } from "lucide-react";
import { Button } from "../ui/button";
import { ConfirmAction } from "./delete-button";
import { useState } from "react";
import { messages, type Locale } from "@peek/core/i18n";
import type { Profile } from "@peek/core/profiles";
import { ExtensionIcon } from "../extension-icon";
import { ProfileLabel } from "../profile-label";
import { SettingsList, SettingsRow } from "./layout";
import { RelatedItemsSection } from "./related-items";
import { Separator } from "../ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { connectionScenarios } from "./connection-bindings";
import type { Status } from "./extensions";

export function ConnectionUsage({ connectionId, instances, packages, profiles, locale, onDisconnect, separated = true }: {
  separated?: boolean;
  connectionId: string;
  instances: Status["instances"];
  packages: Status["packages"];
  profiles: Profile[] | null;
  locale: Locale;
  onDisconnect: (scenarioId: string, disable: boolean) => Promise<() => Promise<void>>;
}) {
  const t = messages(locale);
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
    {separated ? <Separator /> : null}
    <RelatedItemsSection label={t.scenarios} count={scenarios.length}>
    {scenarios.length ? <SettingsList>
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
        return <SettingsRow layout="compact" key={scenario.id} title={scenario.name}
          href={`/scenarios/${encodeURIComponent(scenario.id)}`}
          media={<ExtensionIcon kind="scenario" size="compact" src={pkg?.iconDataUrl} color={pkg?.manifest.iconColor} />}
          actions={<>
            {profile ? <ProfileLabel profile={profile} locale={locale} avatarOnly /> : null}
            <Tooltip>
              {requiresDisable ? <ConfirmAction locale={locale} label={t.disableAndDisconnect}
                description={t.disconnectDisableConfirm.replace("{name}", scenario.name)}
                warning={{ title: t.disconnectDisableWarning, description: t.disconnectDisableConsequence }}
                trigger={trigger} onConfirm={() => disconnect(scenario.id, true)} /> : trigger}
              <TooltipContent>{t.disconnect}</TooltipContent>
            </Tooltip>
          </>}
        />;
      })}
    </SettingsList> : <p className="text-sm text-muted-foreground">{t.connectionUnused}</p>}
    </RelatedItemsSection>
  </>;
}
