"use client";

import { useId, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ChevronRightIcon } from "lucide-react";
import { cva } from "class-variance-authority";
import type { Manifest } from "@peekapp/sdk";
import { messages, type Locale } from "@peek/core/i18n";
import type { Profile } from "@peek/core/profiles";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "../ui/sheet";
import { ExtensionIcon } from "../extension-icon";
import { ProfileLabel } from "../profile-label";
import { EditorPanel, EditorPanelSection, ErrorState, SettingsEmpty } from "./layout";
import { EditorForm, type EditorGuard } from "./editor-form";
import { InstanceHealth } from "./instance-health";
import { api, InstanceEditor, type Status } from "./extensions";
import { ConnectionTypeChoices } from "./definition-picker";
import { compatiblePackages, connectionInputs, selectBinding, type Binding } from "./connection-bindings";
import type { InstanceSetting } from "./instance-draft";

export type ConnectionSheetTarget = { input: string } | { connectionId: string };
const row = cva("grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-md border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]", {
  variants: {
    selected: { true: "border-primary/30 bg-accent/30", false: "border-border" },
    disabled: { true: "", false: "cursor-pointer hover:bg-accent/50" },
  },
});

type Shared = {
  packages: Status["packages"]; instances: Status["instances"]; runtime: Status["runtime"];
  profiles: Profile[] | null; locale: Locale;
};
export function ScenarioConnections({ inputs, bindings, onChange, savedBindings, packages, instances, profiles, runtime, locale,
  existing, busy, activeSetting, savedSetting, error, onOpen,
}: Shared & {
  inputs: ReturnType<typeof connectionInputs>; bindings: Record<string, Binding[]>;
  savedBindings: Record<string, Binding[]>; onChange: Dispatch<SetStateAction<Record<string, Binding[]>>>;
  existing: boolean; busy: boolean; activeSetting: InstanceSetting | null; savedSetting: InstanceSetting | null;
  error: string; onOpen: (target: ConnectionSheetTarget) => void;
}) {
  const t = messages(locale);
  const id = useId();
  const add = (input: string) => <Button type="button" variant="outline" size="sm" onClick={() => onOpen({ input })}>+ {t.addConnection}</Button>;
  return <EditorPanel title={t.connections} description={t.settingsBindingsDescription}
    headerAction={inputs.length === 1 ? add(inputs[0].input) : undefined}
    sections={inputs.map(({ input, requirement, choices }, index) => {
        const setting = `bindings:${input}` as const;
        const selected = bindings[input] ?? [];
        const changed = JSON.stringify(selected) !== JSON.stringify(savedBindings[input] ?? []);
        const missing = !requirement.optional && !choices.some((c) => selected.some((b) => b.connectionId === c.connectionId && b.dataset === c.dataset));
        const Container = existing ? "form" : "div";
        const set = (value: Binding[]) => onChange((previous) => ({ ...previous, [input]: value }));
        const choiceKey = (b: Binding) => JSON.stringify([b.connectionId, b.dataset]);
        const rows = choices.map((choice, choiceIndex) => {
          const item = instances.find((i) => i.id === choice.connectionId);
          const pkg = packages.find((p) => p.manifest.id === item?.package_id);
          const profile = profiles?.find((p) => p.id === item?.profile_id);
          const checked = selected.some((b) => choiceKey(b) === choiceKey(choice));
          const dataset = choices.filter((c) => c.connectionId === choice.connectionId).length > 1;
          const label = `${choice.name}${dataset ? ` (${choice.dataset})` : ""}`;
          const controlId = `${id}-${index}-${choiceIndex}`;
          const controlProps = { id: controlId, "aria-label": label, disabled: !choice.enabled, "aria-describedby": !choice.enabled ? `${id}-${index}-paused` : undefined };
          return <div key={choiceKey(choice)} data-connection-choice className={cn(row({ selected: checked, disabled: !choice.enabled }))}
            onClick={(event) => {
              if (!choice.enabled || (event.target as Element).closest("[role=checkbox], [role=radio], input, label, [data-connection-open]")) return;
              event.currentTarget.querySelector<HTMLButtonElement>("[role=checkbox], [role=radio]")?.click();
            }}>
            {requirement.multiple ? <Checkbox {...controlProps} checked={checked}
              onCheckedChange={(checked) => set(selectBinding(selected, choice, checked === true, true))} />
              : <RadioGroupItem {...controlProps} value={choiceKey(choice)} />}
            <label htmlFor={controlId} className={cn("flex min-w-0 items-center gap-3", choice.enabled && "cursor-pointer")}>
              <ExtensionIcon kind="connection" size="compact" src={pkg?.iconDataUrl} color={pkg?.manifest.iconColor} />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-sm font-medium wrap-anywhere">{choice.name}</span>
                {dataset ? <span className="text-xs text-muted-foreground wrap-anywhere">{choice.dataset}</span> : null}
              </span>
            </label>
            <div className="col-start-2 row-start-2 flex flex-wrap items-center gap-3 sm:col-start-3 sm:row-start-1">
              {profile ? <ProfileLabel profile={profile} locale={locale} avatarOnly /> : null}
              {item ? <InstanceHealth kind="connection" enabled={choice.enabled} error={item.last_error}
                lastSuccess={item.last_success} ready={runtime.ready} locale={locale} /> : null}
            </div>
            <div className="col-start-3 row-start-1 sm:col-start-4">
              <Button data-connection-open type="button" variant="ghost" size="sm" aria-label={`${t.connectionOpen}: ${choice.name}`}
                onClick={() => onOpen({ connectionId: choice.connectionId })}>{t.connectionOpen}<ChevronRightIcon /></Button>
            </div>
          </div>;
        });
        return <Container key={input} data-setting={setting} className="flex flex-col gap-6">
          <EditorPanelSection hint={<details className="text-xs"><summary className="cursor-pointer rounded-sm focus-visible:ring-2 focus-visible:ring-ring">{t.connectionDetails}</summary>
            <p className="mt-2 wrap-anywhere">{requirement.contract} ({requirement.version})</p></details>}
            actions={existing ? <>
              {savedSetting === setting && !changed ? <span role="status">{t.saved}</span> : null}
              <Button type="submit" formNoValidate name="setting" value={setting} size="sm" disabled={busy || missing || !changed}>
                {busy && activeSetting === setting ? t.saving : t.save}</Button>
            </> : undefined}>
          {inputs.length > 1 ? <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="text-sm font-medium wrap-anywhere">{input}</h4>{add(input)}</div> : null}
          <p id={`${id}-${index}-hint`} className={cn("text-sm text-muted-foreground", inputs.length === 1 && "sr-only")}>{requirement.multiple ? t.connectionChooseMany : t.connectionChooseOne}{requirement.optional ? ` ${t.settingsOptional}.` : ""}</p>
          {choices.length ? requirement.multiple ? <div role="group" aria-label={input} aria-describedby={`${id}-${index}-hint`} className="grid gap-2">{rows}</div>
            : <RadioGroup aria-label={inputs.length === 1 ? t.connections : input} aria-describedby={`${id}-${index}-hint`} value={selected[0] ? choiceKey(selected[0]) : requirement.optional ? "none" : ""}
              onValueChange={(value) => { const choice = choices.find((c) => choiceKey(c) === value); set(choice ? [{ connectionId: choice.connectionId, dataset: choice.dataset }] : []); }}>
              {rows}
              {requirement.optional ? <label className="flex items-center gap-3 text-sm"><RadioGroupItem value="none" />{t.connectionNone}</label> : null}
            </RadioGroup>
            : <SettingsEmpty title={t.noCompatibleConnections} description={t.compatibleConnectionRequired} />}
          {choices.some((c) => !c.enabled) ? <p id={`${id}-${index}-paused`} className="text-sm text-muted-foreground">{t.connectionPausedChoice}</p> : null}
          {error && activeSetting === setting ? <ErrorState>{error}</ErrorState> : null}
          </EditorPanelSection>
        </Container>;
      })}
  />;
}

export function ConnectionSheet({ target, manifest, packages, instances, connections, runtime, profiles, profilesError, locale,
  defaultProfile, scenarioDirty, onClose, onRefresh, onSelect, onDeleted,
}: Shared & {
  target: ConnectionSheetTarget; manifest: Manifest; connections: Status["connections"]; profilesError: string;
  defaultProfile: string; scenarioDirty: boolean; onClose: () => void; onRefresh: (status: Status) => void;
  onDeleted: (id: string) => void;
  onSelect: (input: string, binding: Binding) => void;
}) {
  const t = messages(locale);
  const guard = useRef<EditorGuard>(null);
  const [open, setOpen] = useState(true);
  const [deletedId, setDeletedId] = useState<string | null>(null);
  const finish = () => setOpen(false);
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  const [packageId, setPackageId] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [datasets, setDatasets] = useState<Binding[]>([]);
  const editing = "connectionId" in target;
  const item = editing ? instances.find((i) => i.id === target.connectionId) : undefined;
  const pkg = packages.find((p) => p.manifest.id === (editing ? item?.package_id : packageId));
  const editorVisible = !!pkg && !createdId;
  const close = () => { if (!refreshing) guard.current?.requestClose(finish); };
  async function refresh(id: string) {
    setRefreshing(true);
    try {
      const response = await fetch("/api/extensions", { cache: "no-store" });
      if (!response.ok) throw new Error("extensions-unavailable");
      const status: Status = await response.json();
      if (!status.connections.some((c) => c.id === id)) throw new Error("connection-unavailable");
      onRefresh(status);
      setRefreshError(false);
      if (!editing) {
        const choices = connectionInputs(manifest, status.connections).find((i) => i.input === target.input)?.choices.filter((c) => c.connectionId === id && c.enabled) ?? [];
        const matches = choices.map(({ connectionId, dataset }) => ({ connectionId, dataset }));
        if (matches.length === 1) { onSelect(target.input, matches[0]); finish(); }
        else setDatasets(matches);
      }
    } catch { setRefreshError(true); }
    finally { setRefreshing(false); }
  }
  return <Sheet open={open} onOpenChange={(open) => { if (!open) close(); }}>
    <SheetContent locale={locale} variant="editor" onCloseAutoFocus={(e) => {
      e.preventDefault();
      const focusTarget = deletedId ? opener?.closest('[data-slot="card"]')?.querySelector<HTMLButtonElement>("button") : opener;
      if (deletedId) onDeleted(deletedId);
      onClose();
      focusTarget?.focus();
    }}>
      <SheetHeader className="shrink-0 border-b pr-12">
        <SheetTitle>{editing ? item?.name ?? t.connections : t.addConnection}</SheetTitle>
        {!editing ? <SheetDescription>{t.connectionCreateHint}</SheetDescription> : null}
      </SheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6">
        <EditorForm as="div" draft={null} locale={locale} guardRef={!editorVisible ? guard : undefined}
          navigationGuard={!editorVisible} navigationDirty={scenarioDirty} onSubmit={async () => false}>
          {refreshError ? <div className="mb-4 space-y-3"><ErrorState>{t.connectionRefreshFailed}</ErrorState>
            <Button type="button" variant="outline" disabled={refreshing} onClick={() => void refresh(createdId ?? item!.id)}>{t.retry}</Button></div> : null}
          {!pkg && !editing ? <>
            <ConnectionTypeChoices packages={compatiblePackages(manifest, target.input, packages)} locale={locale} embedded onSelect={setPackageId} />
            {!compatiblePackages(manifest, target.input, packages).length ? <p className="mt-3 text-sm text-muted-foreground">{t.connectionInstallRequired}</p> : null}
            <details className="mt-4 text-xs text-muted-foreground"><summary>{t.connectionDetails}</summary><p className="mt-2 wrap-anywhere">{manifest.inputs?.[target.input].contract} ({manifest.inputs?.[target.input].version})</p></details>
          </> : null}
          {createdId && !refreshError ? <div className="space-y-3">
            <p className="text-sm">{datasets.length ? t.connectionChooseDataset : t.saved}</p>
            {datasets.map((binding) => <Button key={binding.dataset} type="button" variant="outline" onClick={() => { if (!editing) onSelect(target.input, binding); finish(); }}>{binding.dataset}</Button>)}
          </div> : null}
        </EditorForm>
        {editorVisible ? <>
          {!editing ? <Button type="button" variant="ghost" size="sm" className="mb-4" disabled={refreshing}
            onClick={() => guard.current?.requestClose(() => setPackageId(null))}>{t.connectionBack}</Button> : null}
          <InstanceEditor key={item?.id ?? pkg.manifest.id} manifest={pkg.manifest} item={item} packages={packages}
            instances={instances} connections={connections} runtime={runtime} profiles={profiles} profilesError={profilesError}
            locale={locale} defaultProfile={defaultProfile} guardRef={guard} navigationDirty={scenarioDirty}
            onDelete={item ? async () => {
              setRefreshing(true);
              try {
                await api({ action: "delete-instance", id: item.id });
                setDeletedId(item.id);
                finish();
              } finally { setRefreshing(false); }
            } : undefined}
            save={async (instance) => {
              const result = await api({ action: "save", instance });
              if (!editing) setCreatedId(result.id);
              await refresh(result.id);
            }} />
        </> : null}
      </div>
    </SheetContent>
  </Sheet>;
}
