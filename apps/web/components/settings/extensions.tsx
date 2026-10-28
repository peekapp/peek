"use client";
import { toast } from "sonner";

import { messages, type Locale } from "@peek/core/i18n";
import { SettingsRowMenu } from "./row-menu";
import { ConnectionScenarioCount, ScenarioCardCount } from "./card-count";
import { InstanceHealth } from "./instance-health";
import { SettingsDataTable } from "./data-table";
import { LoadingState, ErrorState } from "./layout";
import { EditorForm } from "./layout";
import { useEffect, useState, useId, type Ref, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExtensionIcon, ExtensionLabel } from "../extension-icon";
import { DefinitionPicker } from "./definition-picker";
import { settingsText, settingsIssues, type SettingsIssue, type Json, type Manifest, type Schema } from "@peekapp/sdk";
import { ExtensionFields, ExtensionContent } from "./extension-fields";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { Checkbox } from "../ui/checkbox";
import { SettingsSelect } from "./select";
import { SelectItem } from "../ui/select";
import { FieldGroup } from "../ui/field";
import { SettingsField } from "./form-field";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "../ui/card";
import { Alert, AlertDescription } from "../ui/alert";
import { Badge } from "../ui/badge";
import {
  SettingsHeading,
  SettingsToolbar,
  SettingsCollection,
  matchesSearch,
  SearchEmpty,
  SettingsList,
  SettingsRow,
  SettingsRowDetails,
  SettingsEmpty,
  EditorPanel,
} from "./layout";
import { ProfileLabel } from "../profile-label";
import type { Profile } from "@peek/core/profiles";
import { DeleteButton, ConfirmAction } from "./delete-button";
import { ConnectionUsage } from "./connection-usage";
import { ScenarioConnections, ConnectionSheet, type ConnectionSheetTarget } from "./scenario-connections";
import { connectionInputs, connectionScenarios, selectBinding } from "./connection-bindings";
import type { EditorGuard } from "./editor-form";
import { applyInstanceSetting, type InstanceSetting } from "./instance-draft";
type Binding = { connectionId: string; dataset: string };
type Item = {
  id: string;
  package_id: string;
  kind: "scenario" | "connection";
  name: string;
  profile_id: string;
  enabled: number;
  settings: Json;
  bindings: Record<string, Binding[]>;
  hasSecret: boolean;
  last_error: string | null;
  last_success: number | null;
  cardCount: number;
  next_run_at: number | null;
};
export type Status = {
  packages: {
    manifest: Manifest;
    iconDataUrl: string | null;
    explicit: boolean;
    unused: boolean;
    official: boolean;
  }[];
  instances: Item[];
  connections: {
    id: string;
    name: string;
    enabled: boolean;
    contracts: Record<string, { id: string; version: string }>;
  }[];
  operations: { id: string; status: string; error: string | null }[];
  runtime: { ready: boolean; error: string | null };
  canRollback: boolean;
};
export async function api(body: unknown) {
  const r = await fetch("/api/extensions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw Object.assign(new Error(data.error), { issues: data.issues });
  return data;
}
async function disconnectScenario(connectionId: string, scenarioId: string, disable: boolean,
  changed: (scenario: Item, connectionId: string, beforeUndo?: Item) => void) {
  const result = await api({ action: "disconnect", id: scenarioId, connectionId, disable });
  changed(result.instance, connectionId);
  return async () => {
    const restored = await api({ action: "undo-disconnect", undo: result.undo });
    changed(restored.instance, connectionId, result.instance);
  };
}

function initial(schema: Schema): Record<string, Json> {
  return Object.fromEntries(
    Object.entries(schema.properties ?? {})
      .filter(([, s]) => s.default !== undefined)
      .map(([k, s]) => [k, s.default!]),
  );
}
export function Extensions({
  initialData = null,
  initialProfiles = null,
  locale,
  kind,
  itemId,
  packageId,
  onEditorTitleChange,
}: {
  initialData?: Status | null;
  initialProfiles?: Profile[] | null;
  locale: Locale;
  kind?: "scenario" | "connection";
  itemId?: string;
  packageId?: string;
  onEditorTitleChange?: (title: string) => void;
}) {
  const [query, setQuery] = useState("");
  const t = messages(locale);
  const [data, setData] = useState<Status | null>(initialData),
    [error, setError] = useState(""),
    [loadError, setLoadError] = useState(""),
    [busy, setBusy] = useState(false),
    [url, setUrl] = useState("");
  const [review, setReview] = useState<{
    id: string;
    packages: {
      manifest: Manifest;
      sha256: string;
      iconDataUrl: string | null;
    }[];
  } | null>(null);
  const [profiles, setProfiles] = useState<Profile[] | null>(initialProfiles);
  const [profilesError, setProfilesError] = useState("");
  const router = useRouter();
  const section = kind === "scenario" ? "scenarios" : "connections";
  const createHref = (m: Manifest) =>
    `/${m.kind === "scenario" ? "scenarios" : "connections"}/new?package=${encodeURIComponent(m.id)}`;
  async function refresh() {
    const r = await fetch("/api/extensions", { cache: "no-store" });
    if (!r.ok) throw new Error("extensions-unavailable");
    setData(await r.json());
  }
  useEffect(() => {
    let active = true;
    let statusLoaded = false;
    async function loadStatus() {
      try {
        const response = await fetch("/api/extensions", { cache: "no-store" });
        if (!response.ok) throw new Error("extensions-unavailable");
        const status = await response.json();
        if (active) {
          statusLoaded = true;
          setData(status);
          setLoadError("");
        }
      } catch (e) {
        if (active) setLoadError(String(e));
      }
    }
    async function loadProfiles() {
      try {
        const response = await fetch("/api/settings", { cache: "no-store" });
        if (!response.ok) throw new Error("profiles-unavailable");
        const settings = await response.json();
        if (active) {
          setProfiles(settings.profiles);
          setProfilesError("");
        }
      } catch (e) {
        if (active) setProfilesError(String(e));
      }
    }
    void loadStatus();
    void loadProfiles();
    // Keep an open editor stable if its record or schema changes elsewhere.
    const timer = setInterval(() => {
      if (!itemId || !statusLoaded) void loadStatus();
      void loadProfiles();
    }, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [itemId]);
  async function perform(fn: () => Promise<unknown>, success: string, confirmation = false) {
    setBusy(true);
    setError("");
    try {
      try {
        await fn();
      } catch (e) {
        const message = e instanceof Error && e.message === "connection-in-use" ? t.connectionInUse : t.actionFailed;
        if (confirmation) throw new Error(message);
        toast.error(message);
        return;
      }
      toast.success(success);
      try {
        await refresh();
      } catch {
        setError(t.loadError);
      }
    } finally {
      setBusy(false);
    }
  }
  if (kind && itemId) {
    const item =
      itemId === "new"
        ? undefined
        : data?.instances.find((i) => i.id === itemId && i.kind === kind);
    const selectedPackage = data?.packages.find(
      (p) =>
        p.manifest.id === (itemId === "new" ? packageId : item?.package_id) &&
        p.manifest.kind === kind,
    );
    const manifest = selectedPackage?.manifest;
    return (
      <section className="flex flex-col gap-6">
        {error || loadError ? (
          <Alert variant="destructive">
            <AlertDescription>{error || loadError}</AlertDescription>
          </Alert>
        ) : null}
        {!data ? (
          <>
            {!loadError ? (
              <LoadingState layout="editor">{t.loading}</LoadingState>
            ) : null}
          </>
        ) : !manifest || (itemId !== "new" && !item) ? (
          <p>{t.extensionInstanceNotFound}</p>
        ) : (
          <InstanceEditor
            key={item?.id ?? manifest.id}
            manifest={manifest}
            onEditorTitleChange={onEditorTitleChange}
            packages={data.packages}
            instances={data.instances}
            item={item}
            connections={data.connections}
            runtime={data.runtime}
            profiles={profiles}
            profilesError={profilesError}
            locale={locale}
            onDelete={item ? async () => {
              await api({ action: "delete-instance", id: item.id });
              toast.success(item.kind === "scenario" ? t.scenarioDeleted : t.connectionDeleted);
              router.replace(`/${section}`);
            } : undefined}
            save={async (instance) => {
              await api({ action: "save", instance });
              if (!item) router.replace(`/${section}`);
              else {
                try {
                  const response = await fetch("/api/extensions", { cache: "no-store" });
                  if (!response.ok) throw new Error("extensions-unavailable");
                  const status: Status = await response.json();
                  // Refresh saved status without replacing the schema or remounting pending drafts.
                  setData((previous) => previous ? { ...previous, instances: status.instances, connections: status.connections, runtime: status.runtime } : previous);
                  setLoadError("");
                } catch (error) { setLoadError(String(error)); }
              }
            }}
          />
        )}
      </section>
    );
  }
  function connectionUsage(connectionId: string) {
    return data ? <ConnectionUsage connectionId={connectionId} instances={data.instances} packages={data.packages}
      profiles={profiles} locale={locale} onDisconnect={(scenarioId, disable) => disconnectScenario(connectionId, scenarioId, disable,
        (scenario) => setData((previous) => previous ? { ...previous,
          instances: previous.instances.map((value) => value.id === scenario.id ? scenario : value) } : previous))} /> : null;
  }
  const rows =
    data?.instances
      .filter(
        (i) =>
          (!kind || i.kind === kind) &&
          matchesSearch(query, i.name, i.package_id),
      )
      .map((i) => ({
        id: i.id,
        profile: profiles
          ?.filter((p) => p.id === i.profile_id)
          .map((p) => (
            <ProfileLabel key={p.id} profile={p} locale={locale} avatarOnly />
          )),
        count: i.kind === "scenario" ? <ScenarioCardCount count={i.cardCount} locale={locale} />
          : <ConnectionScenarioCount count={connectionScenarios(data.instances, i.id).length} locale={locale} />,
        health: (
          <InstanceHealth kind={i.kind} enabled={!!i.enabled} error={i.last_error} lastSuccess={i.last_success} ready={data.runtime.ready} locale={locale} />
        ),
        media: (
          <ExtensionIcon
            kind={i.kind}
            color={
              data.packages.find((p) => p.manifest.id === i.package_id)
                ?.manifest.iconColor
            }
            src={
              data.packages.find((p) => p.manifest.id === i.package_id)
                ?.iconDataUrl
            }
            size="compact"
          />
        ),
        title: (
          <Link
            className={
              kind
                ? "after:absolute after:inset-0 focus-visible:outline-none"
                : undefined
            }
            href={`/${i.kind === "scenario" ? "scenarios" : "connections"}/${encodeURIComponent(i.id)}`}
          >
            {i.name}
          </Link>
        ),
        description:
          data.packages.find((p) => p.manifest.id === i.package_id)?.manifest
            .name ?? i.package_id,
        status: kind === "scenario" ? null : (
          <Badge variant={!i.enabled ? "inactive" : i.last_error ? "error" : i.last_success !== null ? "success" : "inactive"}>
            {!i.enabled ? t.paused : i.last_error ? t.needsAttention : i.last_success !== null ? t.connected : t.pending}
          </Badge>
        ),
        actions:
          kind ? (
            <SettingsRowMenu
              kind={i.kind}
              deleteContent={i.kind === "connection" ? connectionUsage(i.id) : undefined}
              deleteDisabled={i.kind === "connection" && connectionScenarios(data.instances, i.id).length > 0}
              refreshDisabled={busy || !i.enabled || !data.runtime.ready}
              onRefresh={() => perform(() => api({ action: "run", id: i.id }), t.refreshRequested)}
              enabled={!!i.enabled}
              onToggle={() =>
                perform(() =>
                  api({ action: "set-enabled", id: i.id, enabled: !i.enabled }),
                  i.enabled ? t.scenarioDisabled : t.scenarioEnabled,
                )
              }
              href={`/${i.kind === "scenario" ? "scenarios" : "connections"}/${encodeURIComponent(i.id)}`}
              locale={locale}
              disabled={busy}
              onDelete={() =>
                perform(() => api({ action: "delete-instance", id: i.id }), i.kind === "scenario" ? t.scenarioDeleted : t.connectionDeleted, true)
              }
            />
          ) : (
            <>
              <Button variant="outline" asChild>
                <Link
                  href={`/${i.kind === "scenario" ? "scenarios" : "connections"}/${encodeURIComponent(i.id)}`}
                >
                  {t.edit}
                </Link>
              </Button>
              <DeleteButton
                locale={locale}
                disabled={busy}
                description={i.kind === "connection" && connectionScenarios(data.instances, i.id).length > 0 ? t.connectionDeleteInUse : t.confirmInstanceDelete}
                confirmDisabled={i.kind === "connection" && connectionScenarios(data.instances, i.id).length > 0}
                onConfirm={() =>
                  perform(() => api({ action: "delete-instance", id: i.id }), i.kind === "scenario" ? t.scenarioDeleted : t.connectionDeleted, true)
                }
              >{i.kind === "connection" ? connectionUsage(i.id) : null}</DeleteButton>
            </>
          ),
        children: (
          <>
            {profiles
              ?.filter((p) => p.id === i.profile_id)
              .map((p) => (
                <ProfileLabel key={p.id} profile={p} locale={locale} />
              ))}
            {i.kind === "scenario" ? (
              <div className="flex flex-wrap gap-3">
                {[
                  ...new Set(
                    Object.values(i.bindings)
                      .flat()
                      .map((b) => b.connectionId),
                  ),
                ].map((id) => {
                  const connection = data.connections.find((c) => c.id === id);
                  const instance = data.instances.find((c) => c.id === id);
                  const sourcePackage = data.packages.find(
                    (p) => p.manifest.id === instance?.package_id,
                  );
                  return connection ? (
                    <ExtensionLabel
                      key={id}
                      kind="connection"
                      src={sourcePackage?.iconDataUrl}
                      color={sourcePackage?.manifest.iconColor}
                    >
                      {connection.name}
                    </ExtensionLabel>
                  ) : null;
                })}
              </div>
            ) : null}
            {i.last_error ? (
              <Alert variant="destructive" role="status">
                <AlertDescription>{i.last_error}</AlertDescription>
              </Alert>
            ) : null}
            <SettingsRowDetails label={t.troubleshooting}>
              <dl className="grid gap-4">
                <div className="grid gap-1">
                  <dt>{t.lastUpdated}</dt>
                  <dd className="text-foreground">
                    {i.last_success
                      ? new Date(i.last_success).toLocaleString(locale)
                      : t.notUpdatedYet}
                  </dd>
                </div>
              </dl>
              <Button
                variant="ghost"
                disabled={busy || (i.kind === "scenario" && !i.enabled)}
                onClick={() =>
                  void perform(() => api({ action: "run", id: i.id }), t.refreshRequested)
                }
              >
                {i.kind === "scenario" ? t.updateCards : t.refreshData}
              </Button>
            </SettingsRowDetails>
          </>
        ),
      })) ?? [];
  return (
    <SettingsCollection>
      <SettingsToolbar
        query={query}
        onQueryChange={setQuery}
        placeholder={
          kind === "scenario"
            ? t.searchScenarios
            : kind === "connection"
              ? t.searchConnections
              : t.searchExtensions
        }
        action={
          kind ? (
            <DefinitionPicker
              kind={kind}
              locale={locale}
              packages={data?.packages ?? []}
              disabled={!data}
            />
          ) : null
        }
      />
      {error || loadError || profilesError ? (
        <Alert variant="destructive">
          <AlertDescription role="alert">{error || loadError || profilesError}</AlertDescription>
        </Alert>
      ) : null}
      {data && !data.runtime.ready ? (
        <Alert>
          <AlertDescription>
            {t.extensionRunnerUnavailable} {data.runtime.error}
          </AlertDescription>
        </Alert>
      ) : null}
      <>
        {!kind ? (
          <Card variant="settings">
            <CardHeader>
              <CardTitle>{t.installPackage}</CardTitle>
              <CardDescription>{t.installPackageHint}</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <SettingsField label={t.packageFile}>
                  <Input
                    type="file"
                    accept=".peek"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file)
                        void perform(async () => {
                          if (file.size > 16 * 1024 * 1024)
                            throw new Error("archive-too-large");
                          const r = await fetch("/api/extensions", {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/octet-stream",
                            },
                            body: file,
                          });
                          const result = await r.json();
                          if (!r.ok) throw new Error(result.error);
                          setReview(result);
                        }, t.packageReviewReady);
                      e.target.value = "";
                    }}
                  />
                </SettingsField>
                <SettingsField label={t.releaseUrl}>
                  <Input
                    type="url"
                    value={url}
                    placeholder="https://…"
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </SettingsField>
              </FieldGroup>
            </CardContent>
            <CardFooter>
              <Button
                disabled={busy || !url}
                onClick={() =>
                  void perform(async () =>
                    setReview(await api({ action: "download", url })),
                    t.packageReviewReady,
                  )
                }
              >
                {t.reviewPackage}
              </Button>
            </CardFooter>
          </Card>
        ) : null}
        {review ? (
          <Card variant="settings">
            <CardHeader>
              <CardTitle>{t.reviewInstallation}</CardTitle>
              <CardDescription>{t.unreviewedPackagesWarning}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul>
                {review.packages.map(({ manifest: m, sha256, iconDataUrl }) => (
                  <li key={m.id}>
                    <div className="flex items-center gap-3">
                      <ExtensionIcon kind={m.kind} src={iconDataUrl} color={m.iconColor} />
                      <strong>
                        {m.name} · {m.version}
                      </strong>
                    </div>
                    <p>
                      {m.id} — {m.author}
                    </p>
                    <p>{m.description}</p>
                    <p>
                      {m.kind === "scenario"
                        ? t.scenarioPermissions
                        : m.permissions.internet
                          ? t.connectionInternetAccess
                          : t.connectionNoInternet}
                    </p>
                    {m.permissions.local?.map((x) => (
                      <p key={`${x.address}:${x.port}`}>
                        {t.localService}: {x.address}:{x.port}
                      </p>
                    ))}
                    <details>
                      <summary>SHA-256</summary>
                      <code className="break-all">{sha256}</code>
                    </details>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter className="flex-wrap gap-2">
              <Button
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await api({ action: "confirm", id: review.id });
                    setReview(null);
                  }, t.installationRequested)
                }
              >
                {t.acceptAndInstall}
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  void perform(async () => {
                    await api({ action: "cancel", id: review.id });
                    setReview(null);
                  }, t.installationCancelled)
                }
              >
                {t.cancel}
              </Button>
            </CardFooter>
          </Card>
        ) : null}
        {data?.operations
          .filter((o) => !["review", "complete"].includes(o.status))
          .map((o) => (
            <Alert
              key={o.id}
              variant={o.status === "failed" ? "destructive" : "default"}
            >
              <AlertDescription>
                {o.status}: {o.error ?? t.waitingForTheExtensionRunner}
              </AlertDescription>
            </Alert>
          ))}
        {!data && !error && !loadError ? (
          <LoadingState layout="list">{t.loading}</LoadingState>
        ) : null}
        {kind &&
          data &&
          !query.trim() &&
          !data.instances.some((i) => i.kind === kind) ? (
          <SettingsEmpty
            title={kind === "scenario" ? t.noScenariosYet : t.noConnectionsYet}
            description={t.addFromLibraryHint}
          />
        ) : null}
        {data &&
          query.trim() &&
          !data.instances.some(
            (i) =>
              (!kind || i.kind === kind) &&
              matchesSearch(query, i.name, i.package_id),
          ) &&
          (kind ||
            !data.packages.some((p) =>
              matchesSearch(
                query,
                p.manifest.name,
                p.manifest.id,
                p.manifest.description,
              ),
            )) ? (
          <SearchEmpty locale={locale} />
        ) : null}
        {!kind ? (
          <>
            <SettingsHeading title={t.installedPackages} />
            {data?.packages.length === 0 && !query.trim() ? (
              <SettingsEmpty title={t.noPackagesInstalledYet} />
            ) : null}
            <SettingsList>
              {data?.packages
                .filter(
                  (p) =>
                    (!kind || p.manifest.kind === kind) &&
                    matchesSearch(
                      query,
                      p.manifest.name,
                      p.manifest.id,
                      p.manifest.description,
                    ),
                )
                .map((p) => (
                  <SettingsRow
                    key={p.manifest.id}
                    media={
                      <ExtensionIcon
                        kind={p.manifest.kind}
                        src={p.iconDataUrl}
                        color={p.manifest.iconColor}
                      />
                    }
                    title={p.manifest.name}
                    description={`${p.manifest.id} · ${p.manifest.version} · ${p.manifest.author}`}
                    actions={
                      <>
                        <Button variant="outline" asChild>
                          <Link href={createHref(p.manifest)}>
                            {p.manifest.kind === "scenario"
                              ? t.createScenario
                              : t.addConnection}
                          </Link>
                        </Button>
                        <DeleteButton
                          locale={locale}
                          disabled={busy || !p.unused}
                          description={t.confirmPackageDelete}
                          onConfirm={() =>
                            perform(() =>
                              api({
                                action: "delete-package",
                                id: p.manifest.id,
                              }),
                              t.packageDeleted, true,
                            )
                          }
                        />
                      </>
                    }
                  >
                    <Badge variant="outline">
                      {p.official ? t.official : t.unreviewed}
                    </Badge>
                    <p>{p.manifest.description}</p>
                    {p.unused && !p.explicit ? (
                      <p>{t.unusedDependencyCanBeRemoved}</p>
                    ) : null}
                  </SettingsRow>
                ))}
            </SettingsList>
            <SettingsHeading title={t.configuredScenariosAndConnections} />
          </>
        ) : null}
        {kind ? (
          <SettingsDataTable rows={rows} locale={locale} kind={kind} />
        ) : (
          <SettingsList>
            {rows.map(({ id, ...row }) => (
              <SettingsRow key={id} {...row} />
            ))}
          </SettingsList>
        )}
        {!kind && data?.canRollback ? (
          <ConfirmAction
            locale={locale}
            disabled={busy}
            label={t.restorePreviousInstallation}
            description={t.confirmRestoreInstallation}
            onConfirm={() => perform(() => api({ action: "rollback" }), t.installationRestored, true)}
          />
        ) : null}
      </>
    </SettingsCollection>
  );
}
export function InstanceEditor({
  manifest: m,
  onEditorTitleChange,
  packages,
  instances,
  item,
  connections,
  runtime,
  profiles,
  profilesError,
  locale,
  save,
  guardRef,
  navigationDirty = false,
  defaultProfile = "shared",
  onDelete,
  onDisconnected,
}: {
  onDelete?: () => Promise<void>;
  onDisconnected?: (scenario: Item, connectionId: string, previous?: Item) => void;
  guardRef?: Ref<EditorGuard>;
  navigationDirty?: boolean;
  defaultProfile?: string;
  manifest: Manifest;
  onEditorTitleChange?: (title: string) => void;
  packages: Status["packages"];
  instances: Status["instances"];
  item?: Item;
  connections: Status["connections"];
  runtime: Status["runtime"];
  profiles: Profile[] | null;
  profilesError: string;
  locale: Locale;
  save: (v: unknown) => Promise<void>;
}) {
  const t = messages(locale);
  const [name, setName] = useState(item?.name ?? m.name),
    [profile, setProfile] = useState(item?.profile_id ?? defaultProfile),
    [enabled, setEnabled] = useState(item ? !!item.enabled : true);
  const [settings, setSettings] = useState<Record<string, Json>>(
    (item?.settings as Record<string, Json>) ?? initial(m.settings),
  ),
    [secrets, setSecrets] = useState<Record<string, Json>>(
      initial(m.secrets ?? {}),
    ),
    [changeSecrets, setChangeSecrets] = useState(!item?.hasSecret);
  const [bindings, setBindings] = useState<Record<string, Binding[]>>(
    item?.bindings ?? {},
  ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const draft = { name, profile, enabled, settings, secrets, changeSecrets, bindings };
  const [savedDraft, setSavedDraft] = useState(draft);
  const editorTitle = item ? savedDraft.name : `${t.configure} ${m.name}`;
  useEffect(() => {
    onEditorTitleChange?.(editorTitle);
  }, [editorTitle, onEditorTitleChange]);
  const [issues, setIssues] = useState<SettingsIssue[]>([]);
  const [activeSetting, setActiveSetting] = useState<InstanceSetting | null>(null);
  const editorId = useId();
  const [sheet, setSheet] = useState<ConnectionSheetTarget | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<Pick<Status, "instances" | "connections" | "runtime"> | null>(null);
  const currentConnections = connectionStatus?.connections ?? connections;
  const currentInstances = connectionStatus?.instances ?? instances;
  function disconnected(scenario: Item, connectionId: string, beforeUndo?: Item) {
    setConnectionStatus((previous) => ({ instances: (previous?.instances ?? instances).map((value) => value.id === scenario.id ? scenario : value),
      connections: previous?.connections ?? connections, runtime: previous?.runtime ?? runtime }));
    if (item?.id === scenario.id) {
      const remove = (values: Record<string, Binding[]>) => Object.fromEntries(Object.entries(values)
        .map(([input, bindings]) => [input, bindings.filter((binding) => binding.connectionId !== connectionId)]));
      if (beforeUndo) {
        setBindings((previous) => Object.fromEntries(Object.keys({ ...previous, ...scenario.bindings }).map((input) => [input,
          JSON.stringify(previous[input] ?? []) === JSON.stringify(beforeUndo.bindings[input] ?? [])
            ? scenario.bindings[input] ?? [] : previous[input] ?? [],
        ])));
        setSavedDraft((previous) => ({ ...previous, enabled: !!scenario.enabled, bindings: scenario.bindings }));
        if (beforeUndo.enabled !== scenario.enabled) setEnabled(!!scenario.enabled);
      } else {
        setBindings(remove);
        setSavedDraft((previous) => ({ ...previous, enabled: !!scenario.enabled, bindings: remove(previous.bindings) }));
        if (savedDraft.enabled && !scenario.enabled) setEnabled(false);
      }
    }
    onDisconnected?.(scenario, connectionId, beforeUndo);
  }
  const inputs = connectionInputs(m, currentConnections);
  const missingInput = inputs.find(
    ({ input, requirement, choices }) =>
      !requirement.optional &&
      !choices.some((choice) =>
        (bindings[input] ?? []).some(
          (binding) =>
            binding.connectionId === choice.connectionId &&
            binding.dataset === choice.dataset,
        ),
      ),
  );
  function panel(setting: InstanceSetting, title: string, children: ReactNode, disabled = false, description?: string, footer?: ReactNode, editable = true, media?: ReactNode, headerAction?: ReactNode) {
    const changed = JSON.stringify(applyInstanceSetting(savedDraft, draft, setting, m.settingsUi.blocks)) !== JSON.stringify(savedDraft);
    const Container = item ? "form" : "div";
    return (
      <Container key={setting} data-setting={setting}>
        <EditorPanel
          title={title}
          description={description}
          media={media}
          headerAction={headerAction}
          hint={footer}
          actions={item && editable ?
            <>
              <Button size="sm" type="submit" formNoValidate name="setting" value={setting}
                disabled={busy || disabled || (item ? !changed : !!missingInput)}>
                {busy && activeSetting === setting ? t.saving : t.save}
              </Button>
            </> : undefined
          }
        >
          {children || (item && error && activeSetting === setting) ? <>
            {children}
            {item && error && activeSetting === setting ? <ErrorState>{error}</ErrorState> : null}
          </> : null}
        </EditorPanel>
      </Container>
    );
  }
  return (
    <div>
      <EditorForm
        layout="settings"
        id={editorId}
        guardRef={guardRef}
        navigationGuard={!sheet}
        navigationDirty={navigationDirty}
        as={item ? "div" : "form"}
        draft={draft}
        savedDraft={savedDraft}
        locale={locale}
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          if (!submitter) return false;
          const setting = submitter.value as InstanceSetting;
          const block = m.settingsUi.blocks.find((b) => `block:${b.id}` === setting);
          const savingSecrets = block?.source === "secrets";
          const next = item ? applyInstanceSetting(savedDraft, draft, setting, m.settingsUi.blocks) : draft;
          const missingSavedInput = next.enabled && inputs.find(({ input, requirement, choices }) => !requirement.optional &&
            !choices.some((choice) => (next.bindings[input] ?? []).some((binding) =>
              binding.connectionId === choice.connectionId && binding.dataset === choice.dataset)));
          if (missingSavedInput) {
            setActiveSetting(setting);
            setError(t.chooseACompatibleConnectionFor + ` ${missingSavedInput.input}.`);
            return false;
          }
          setActiveSetting(setting);
          const fields = item && block ? (block.controls ?? []).flatMap((c) => c.type === "text" ? [] : [c.field]) : undefined;
          const nextIssues = [
            ...(!item || block && !savingSecrets ? settingsIssues(m.settings, next.settings, "settings", fields) : []),
            ...((!item || savingSecrets) && next.changeSecrets && m.secrets ? settingsIssues(m.secrets, next.secrets, "secrets") : []),
          ];
          setIssues(nextIssues);
          if (nextIssues.length || !next.name.trim() || next.name.length > 100 || !profiles?.some((p) => p.id === next.profile)) {
            setError(item ? t.settingsSaveError : t.settingsCreateError);
            requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
            return false;
          }
          setBusy(true);
          setError("");
          try {
            await save({
              id: item?.id,
              packageId: m.id,
              name: next.name,
              profileId: next.profile,
              enabled: next.enabled,
              settings: next.settings,
              bindings: next.bindings,
              ...((!item || savingSecrets) && next.changeSecrets ? { secrets: next.secrets } : {}),
            });
            // Never retain submitted credentials in the saved browser snapshot.
            const committed = (!item || savingSecrets) && next.changeSecrets ? { ...next, secrets: {}, changeSecrets: false } : next;
            if (committed !== next) { setSecrets({}); setChangeSecrets(false); }
            setSavedDraft(committed);
            toast.success(item ? t.saved : m.kind === "scenario" ? t.scenarioCreated : t.connectionCreated);
            return true;
          } catch (e) {
            const serverIssues = (e as { issues?: SettingsIssue[] }).issues;
            if (serverIssues) setIssues(serverIssues);
            setError(serverIssues ? (item ? t.settingsSaveError : t.settingsCreateError) : e instanceof Error ? (e.message === "connection-paused" ? t.connectionPausedChoice : e.message) : String(e));
            return false;
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="flex flex-col gap-6">
          {panel("general", m.name,
            <>
              <div className="grid gap-6 sm:grid-cols-2">
                <SettingsField label={t.name}>
                  <Input required maxLength={100}
                    aria-invalid={!!error && (!name.trim() || name.length > 100)}
                    value={name} onChange={(e) => setName(e.target.value)} />
                </SettingsField>
                <SettingsField label={t.profile}>
                  {profiles ? (
                    <SettingsSelect value={profile} onValueChange={setProfile}>
                      {profiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <ProfileLabel profile={p} locale={locale} />
                        </SelectItem>
                      ))}
                    </SettingsSelect>
                  ) : profilesError ? <ErrorState>{profilesError}</ErrorState> : <LoadingState layout="fields">{t.loadingProfiles}</LoadingState>}
                </SettingsField>
              </div>
              {item ? <div className="flex flex-col items-start gap-2">
                <InstanceHealth kind={m.kind} enabled={savedDraft.enabled} error={item.last_error}
                  lastSuccess={item.last_success} ready={runtime.ready} locale={locale} showUpdated />
                {m.kind === "scenario" ? <ScenarioCardCount count={item.cardCount} locale={locale} /> : null}
                {m.kind === "connection" && !savedDraft.enabled ? <p className="text-sm text-muted-foreground">{t.connectionPaused}</p> : null}
                {item.last_error || !runtime.ready ? <Alert variant="destructive" className="wrap-anywhere">
                  <AlertDescription>{item.last_error || t.extensionRunnerUnavailable}</AlertDescription>
                </Alert> : null}
              </div> : null}
              {item && m.kind === "connection" ? <ConnectionUsage connectionId={item.id}
                instances={currentInstances} packages={packages} profiles={profiles} locale={locale}
                onDisconnect={(scenarioId, disable) => disconnectScenario(item.id, scenarioId, disable, disconnected)} /> : null}
            </>, !profiles, m.description, undefined, true,
            <ExtensionIcon kind={m.kind} size="header" src={packages.find((p) => p.manifest.id === m.id)?.iconDataUrl} color={m.iconColor} />,
            <div className="flex items-center gap-2">
              <SettingsField label={t.statusEnabled}>
                <Switch checked={enabled} onCheckedChange={setEnabled} />
              </SettingsField>
              {item && onDelete ? <SettingsRowMenu locale={locale} kind={m.kind} disabled={busy}
                deleteDisabled={m.kind === "connection" && connectionScenarios(currentInstances, item.id).length > 0}
                deleteContent={m.kind === "connection" ? <ConnectionUsage connectionId={item.id}
                  instances={currentInstances} packages={packages} profiles={profiles} locale={locale}
                  onDisconnect={(scenarioId, disable) => disconnectScenario(item.id, scenarioId, disable, disconnected)} /> : undefined}
                onDelete={async () => {
                  setBusy(true);
                  try { await onDelete(); }
                  catch (error) {
                    throw new Error(error instanceof Error && error.message === "connection-in-use" ? t.connectionInUse : t.actionFailed);
                  } finally { setBusy(false); }
                }} /> : null}
            </div>
          )}
          {inputs.length ? <ScenarioConnections
            inputs={inputs} bindings={bindings} onChange={setBindings}
            savedBindings={savedDraft.bindings} packages={packages} instances={currentInstances}
            profiles={profiles} runtime={connectionStatus?.runtime ?? runtime} locale={locale}
            existing={!!item} allowEmpty={item ? !savedDraft.enabled : !enabled} busy={busy} activeSetting={activeSetting}
            error={error} onOpen={setSheet}
          /> : null}
          {m.settingsUi.blocks.map((block) => {
            const secret = block.source === "secrets";
            const editable = (block.controls ?? []).some((c) => c.type !== "text" && c.type !== "readonly" && !c.disabled);
            return panel(`block:${block.id}`, settingsText(block.name, locale, t),
              (block.controls?.length ? <>
                {secret && item ? <SettingsField label={t.setCredentialsHint}>
                  <Checkbox checked={changeSecrets} onCheckedChange={(v) => { setChangeSecrets(v === true); setSecrets(initial(m.secrets!)); }} />
                </SettingsField> : null}
                {!secret || changeSecrets ? <ExtensionFields block={block} schema={secret ? m.secrets! : m.settings}
                  values={secret ? secrets : settings} onChange={secret ? setSecrets : setSettings} locale={locale} issues={issues} /> : null}
              </> : null), false, settingsText(block.description, locale, t),
              block.footer ? <ExtensionContent content={block.footer} locale={locale} /> : undefined, editable);
          })}
          {!item ? <>
            {error ? <ErrorState>{error}</ErrorState> : null}
            <div><Button type="submit" formNoValidate name="setting" value="create" disabled={busy || !profiles || (enabled && !!missingInput)}>
              {busy ? t.saving : t.settingsCreate}
            </Button></div>
          </> : null}
        </div>
      </EditorForm>
      {sheet ? <ConnectionSheet target={sheet} manifest={m} packages={packages}
        instances={currentInstances} connections={currentConnections} runtime={connectionStatus?.runtime ?? runtime}
        profiles={profiles} profilesError={profilesError} locale={locale} defaultProfile={profile}
        scenarioDirty={JSON.stringify(draft) !== JSON.stringify(savedDraft)}
        onClose={() => setSheet(null)} onRefresh={setConnectionStatus} onDisconnected={disconnected}
        onDeleted={(id) => {
          setConnectionStatus({
            instances: currentInstances.filter((instance) => instance.id !== id),
            connections: currentConnections.filter((connection) => connection.id !== id),
            runtime: connectionStatus?.runtime ?? runtime,
          });
          setBindings((previous) => Object.fromEntries(Object.entries(previous).map(([input, values]) =>
            [input, values.filter((binding) => binding.connectionId !== id)])));
        }}
        onSelect={(input, binding) => setBindings((previous) => ({ ...previous,
          [input]: selectBinding(previous[input] ?? [], binding, true, !!m.inputs?.[input].multiple),
        }))} /> : null}

    </div>
  );
}
