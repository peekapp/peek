"use client";

import { messages, type Locale } from "@peek/core/i18n";
import { SettingsRowMenu } from "./row-menu";
import { ScenarioCardCount } from "./card-count";
import { InstanceHealth } from "./instance-health";
import { SettingsDataTable } from "./data-table";
import { LoadingState, ErrorState } from "./layout";
import { EditorForm } from "./layout";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExtensionIcon, ExtensionLabel } from "../extension-icon";
import { DefinitionPicker } from "./definition-picker";
import type { Json, Manifest, Schema } from "@peekapp/sdk";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Input } from "../ui/input";
import { Checkbox } from "../ui/checkbox";
import { SettingsSelect } from "./select";
import { SelectItem } from "../ui/select";
import {
  FieldGroup,
  FieldSet,
  FieldLegend,
  FieldDescription,
} from "../ui/field";
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
  EditorHeader,
  EditorSection,
  EditorActions,
} from "./layout";
import { ProfileLabel } from "../profile-label";
import type { Profile } from "@peek/core/profiles";
import { DeleteButton, ConfirmAction } from "./delete-button";
import { acceptsContract } from "@peek/extensions/compatibility";
import { numericSetting } from "./numeric-setting";
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
    contracts: Record<string, { id: string; version: string }>;
  }[];
  operations: { id: string; status: string; error: string | null }[];
  runtime: { ready: boolean; error: string | null };
  canRollback: boolean;
};
async function api(body: unknown) {
  const r = await fetch("/api/extensions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error);
  return data;
}
function initial(schema: Schema): Record<string, Json> {
  return Object.fromEntries(
    Object.entries(schema.properties ?? {})
      .filter(
        ([, s]) =>
          s.default !== undefined || s.enum?.length || s.type === "boolean",
      )
      .map(([k, s]) => [k, s.default ?? s.enum?.[0] ?? false]),
  );
}
function SchemaFields({
  schema,
  value,
  onChange,
  secret = false,
}: {
  schema: Schema;
  value: Record<string, Json>;
  onChange: (v: Record<string, Json>) => void;
  secret?: boolean;
}) {
  return (
    <>
      {Object.entries(schema.properties ?? {}).map(([key, s]) => {
        const update = (v: Json) => onChange({ ...value, [key]: v });
        const required = schema.required?.includes(key);
        return (
          <SettingsField key={key} label={s.title ?? key}>
            {s.enum ? (
              <SettingsSelect
                value={JSON.stringify(value[key] ?? s.enum[0])}
                onValueChange={(v) => update(JSON.parse(v))}
              >
                {s.enum.map((v) => (
                  <SelectItem key={JSON.stringify(v)} value={JSON.stringify(v)}>
                    {String(v)}
                  </SelectItem>
                ))}
              </SettingsSelect>
            ) : s.type === "boolean" ? (
              <Checkbox
                checked={value[key] === true}
                onCheckedChange={(v) => update(v === true)}
              />
            ) : ["string", "integer", "number"].includes(s.type ?? "") ? (
              <Input
                type={
                  secret ? "password" : s.type === "string" ? "text" : "number"
                }
                step={s.type === "integer" ? 1 : "any"}
                required={
                  required &&
                  (s.type !== "string" ||
                    (typeof s.minLength === "number" && s.minLength > 0))
                }
                min={typeof s.minimum === "number" ? s.minimum : undefined}
                max={typeof s.maximum === "number" ? s.maximum : undefined}
                minLength={
                  typeof s.minLength === "number" ? s.minLength : undefined
                }
                maxLength={
                  typeof s.maxLength === "number" ? s.maxLength : undefined
                }
                autoComplete={secret ? "new-password" : "off"}
                value={String(value[key] ?? "")}
                onChange={(e) =>
                  s.type === "string"
                    ? update(e.target.value)
                    : onChange(numericSetting(value, key, e.target.value))
                }
              />
            ) : (
              <Textarea
                defaultValue={JSON.stringify(
                  value[key] ?? s.default ?? null,
                  null,
                  2,
                )}
                rows={4}
                onBlur={(e) => {
                  try {
                    update(JSON.parse(e.target.value));
                    e.target.setCustomValidity("");
                  } catch {
                    e.target.setCustomValidity("Invalid JSON");
                    e.target.reportValidity();
                  }
                }}
              />
            )}
          </SettingsField>
        );
      })}
    </>
  );
}
export function Extensions({
  initialData = null,
  initialProfiles = null,
  locale,
  kind,
  itemId,
  packageId,
}: {
  initialData?: Status | null;
  initialProfiles?: Profile[] | null;
  locale: Locale;
  kind?: "scenario" | "connection";
  itemId?: string;
  packageId?: string;
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
  async function perform(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
            <EditorHeader
              backHref={`/${section}`}
              backLabel={t.backToList}
              title={t.configure}
            />
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
            iconDataUrl={selectedPackage?.iconDataUrl}
            packages={data.packages}
            instances={data.instances}
            item={item}
            connections={data.connections}
            profiles={profiles}
            profilesError={profilesError}
            locale={locale}
            save={async (instance) => {
              await api({ action: "save", instance });
              router.push(`/${section}`);
            }}
          />
        )}
      </section>
    );
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
        cardCount: <ScenarioCardCount count={i.cardCount} locale={locale} />,
        health: (
          <InstanceHealth kind={i.kind} enabled={!!i.enabled} error={i.last_error} lastSuccess={i.last_success} ready={data.runtime.ready} locale={locale} />
        ),
        error: i.last_error ? (
          <Alert variant="destructive" role="status">
            <AlertDescription>{i.last_error}</AlertDescription>
          </Alert>
        ) : null,
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
          <Badge variant={i.last_error ? "error" : i.last_success !== null ? "success" : "inactive"}>
            {i.last_error ? t.needsAttention : i.last_success !== null ? t.connected : t.pending}
          </Badge>
        ),
        actions:
          kind ? (
            <SettingsRowMenu
              kind={i.kind}
              refreshDisabled={busy || (i.kind === "scenario" && !i.enabled) || !data.runtime.ready}
              onRefresh={() => perform(() => api({ action: "run", id: i.id }))}
              enabled={!!i.enabled}
              onToggle={() =>
                perform(() =>
                  api({ action: "set-enabled", id: i.id, enabled: !i.enabled }),
                )
              }
              href={`/${i.kind === "scenario" ? "scenarios" : "connections"}/${encodeURIComponent(i.id)}`}
              locale={locale}
              disabled={busy}
              onDelete={() =>
                perform(() => api({ action: "delete-instance", id: i.id }))
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
                description={t.confirmInstanceDelete}
                onConfirm={() =>
                  perform(() => api({ action: "delete-instance", id: i.id }))
                }
              />
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
                  void perform(() => api({ action: "run", id: i.id }))
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
          <Card>
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
                        });
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
                  )
                }
              >
                {t.reviewPackage}
              </Button>
            </CardFooter>
          </Card>
        ) : null}
        {review ? (
          <Card>
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
                  })
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
                  })
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
            onConfirm={() => perform(() => api({ action: "rollback" }))}
          />
        ) : null}
      </>
    </SettingsCollection>
  );
}
function InstanceEditor({
  manifest: m,
  iconDataUrl,
  packages,
  instances,
  item,
  connections,
  profiles,
  profilesError,
  locale,
  save,
}: {
  manifest: Manifest;
  iconDataUrl?: string | null;
  packages: Status["packages"];
  instances: Status["instances"];
  item?: Item;
  connections: Status["connections"];
  profiles: Profile[] | null;
  profilesError: string;
  locale: Locale;
  save: (v: unknown) => Promise<void>;
}) {
  const t = messages(locale);
  const [name, setName] = useState(item?.name ?? m.name),
    [profile, setProfile] = useState(item?.profile_id ?? "shared"),
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
  const inputs = Object.entries(m.inputs ?? {}).map(([input, requirement]) => ({
    input,
    requirement,
    choices: connections.flatMap((connection) =>
      Object.entries(connection.contracts)
        .filter(([, contract]) => acceptsContract(m, requirement, contract))
        .map(([dataset]) => {
          const sourcePackage = packages.find(
            (p) => p.manifest.id === instances.find((i) => i.id === connection.id)?.package_id,
          );
          return {
            connectionId: connection.id,
            name: connection.name,
            iconDataUrl: sourcePackage?.iconDataUrl,
            iconColor: sourcePackage?.manifest.iconColor,
            dataset,
          };
        }),
    ),
  }));
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
  return (
    <div>
      <EditorHeader
        media={
          <ExtensionIcon kind={m.kind} src={iconDataUrl} color={m.iconColor} />
        }
        title={item?.name ?? `${t.configure} ${m.name}`}
        description={m.description}
        backHref={`/${m.kind === "scenario" ? "scenarios" : "connections"}`}
        backLabel={t.backToList}
      />
      <EditorForm
        id="extension-instance"
        draft={{
          name,
          profile,
          enabled,
          settings,
          secrets,
          changeSecrets,
          bindings,
        }}
        locale={locale}
        onSubmit={async (e) => {
          e.preventDefault();
          if (missingInput) {
            setError(
              t.chooseACompatibleConnectionFor + ` ${missingInput.input}.`,
            );
            return false;
          }
          setBusy(true);
          setError("");
          try {
            await save({
              id: item?.id,
              packageId: m.id,
              name,
              profileId: profile,
              enabled: m.kind === "connection" || enabled,
              settings,
              bindings,
              ...(changeSecrets ? { secrets } : {}),
            });
            return true;
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            return false;
          } finally {
            setBusy(false);
          }
        }}
      >
        <EditorSection>
          <FieldGroup>
            <SettingsField label={t.name}>
              <Input
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
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
              ) : profilesError ? (
                <ErrorState>{profilesError}</ErrorState>
              ) : (
                <LoadingState layout="fields">{t.loadingProfiles}</LoadingState>
              )}
            </SettingsField>
            {m.kind === "scenario" && (
              <SettingsField label={t.statusEnabled}>
                <Checkbox
                  checked={enabled}
                  onCheckedChange={(v) => setEnabled(v === true)}
                />
              </SettingsField>
            )}
            <SchemaFields
              schema={m.settings}
              value={settings}
              onChange={setSettings}
            />
            {m.secrets ? (
              <>
                <SettingsField label={t.setCredentialsHint}>
                  <Checkbox
                    checked={changeSecrets}
                    onCheckedChange={(v) => setChangeSecrets(v === true)}
                  />
                </SettingsField>
                {changeSecrets ? (
                  <SchemaFields
                    secret
                    schema={m.secrets}
                    value={secrets}
                    onChange={setSecrets}
                  />
                ) : null}
              </>
            ) : null}
            {inputs.map(({ input, requirement, choices }) => (
              <FieldSet key={input} aria-describedby={`input-${input}-hint`}>
                <FieldLegend>
                  {t.connections} ({input}){" "}
                  {requirement.optional ? t.optional : ""}
                </FieldLegend>
                <FieldDescription id={`input-${input}-hint`}>
                  {requirement.optional
                    ? t.optionalConnection
                    : t.compatibleConnectionRequired}
                </FieldDescription>
                {!choices.length ? (
                  <SettingsEmpty
                    title={t.noCompatibleConnections}
                    description={
                      t.addAConnectionThatProvides +
                      ` ${requirement.contract} (${requirement.version}).`
                    }
                    action={
                      <Button variant="outline" asChild>
                        <Link href="/connections">{t.addConnection}</Link>
                      </Button>
                    }
                  />
                ) : (
                  choices.map((choice) => (
                    <SettingsField
                      key={`${choice.connectionId}:${choice.dataset}`}
                      label={
                        <ExtensionLabel
                          kind="connection"
                          src={choice.iconDataUrl}
                          color={choice.iconColor}
                        >
                          {choice.name}
                        </ExtensionLabel>
                      }
                    >
                      <Checkbox
                        checked={(bindings[input] ?? []).some(
                          (binding) =>
                            binding.connectionId === choice.connectionId &&
                            binding.dataset === choice.dataset,
                        )}
                        onCheckedChange={(checked) => {
                          const rest = (bindings[input] ?? []).filter(
                            (binding) =>
                              (binding.connectionId !== choice.connectionId ||
                                binding.dataset !== choice.dataset) &&
                              choices.some(
                                (option) =>
                                  option.connectionId ===
                                  binding.connectionId &&
                                  option.dataset === binding.dataset,
                              ),
                          );
                          setBindings({
                            ...bindings,
                            [input]:
                              checked === true
                                ? [
                                  ...(requirement.multiple ? rest : []),
                                  {
                                    connectionId: choice.connectionId,
                                    dataset: choice.dataset,
                                  },
                                ]
                                : rest,
                          });
                        }}
                      />
                    </SettingsField>
                  ))
                )}
              </FieldSet>
            ))}
            {error ? <ErrorState>{error}</ErrorState> : null}
          </FieldGroup>
        </EditorSection>
        <EditorActions>
          <Button
            type="submit"
            form="extension-instance"
            disabled={busy || !!missingInput}
          >
            {busy ? t.saving : t.save}
          </Button>
          <Button variant="ghost" asChild>
            <Link
              href={`/${m.kind === "scenario" ? "scenarios" : "connections"}`}
              data-discard-changes
            >
              {t.cancel}
            </Link>
          </Button>
        </EditorActions>
      </EditorForm>
    </div>
  );
}
