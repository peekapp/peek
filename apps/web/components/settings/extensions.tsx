"use client";
import { LoadingState, ErrorState } from "./layout";
import { EditorForm } from "./layout";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  SettingsGrid,
  SettingsCard,
  SettingsCardDetails,
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
  next_run_at: number | null;
};
export type Status = {
  packages: {
    manifest: Manifest;
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
  locale: "en" | "ru";
  kind?: "scenario" | "connection";
  itemId?: string;
  packageId?: string;
}) {
  const [query, setQuery] = useState("");
  const ru = locale === "ru",
    t = (en: string, other: string) => (ru ? other : en);
  const [data, setData] = useState<Status | null>(initialData),
    [error, setError] = useState(""),
    [loadError, setLoadError] = useState(""),
    [busy, setBusy] = useState(false),
    [url, setUrl] = useState("");
  const [review, setReview] = useState<{
    id: string;
    packages: { manifest: Manifest; sha256: string }[];
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
    const manifest = data?.packages.find(
      (p) =>
        p.manifest.id === (itemId === "new" ? packageId : item?.package_id) &&
        p.manifest.kind === kind,
    )?.manifest;
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
              backLabel={t("Back to list", "Назад к списку")}
              title={t("Configure", "Настроить")}
            />
            {!loadError ? (
              <LoadingState layout="editor">
                {t("Loading…", "Загрузка…")}
              </LoadingState>
            ) : null}
          </>
        ) : !manifest || (itemId !== "new" && !item) ? (
          <p>
            {t(
              "Scenario or connection not found.",
              "Сценарий или подключение не найдено.",
            )}
          </p>
        ) : (
          <InstanceEditor
            key={item?.id ?? manifest.id}
            manifest={manifest}
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
  return (
    <SettingsCollection>
      <SettingsToolbar
        query={query}
        onQueryChange={setQuery}
        placeholder={
          kind === "scenario"
            ? t("Search scenarios", "Поиск сценариев")
            : kind === "connection"
              ? t("Search connections", "Поиск подключений")
              : t("Search extensions", "Поиск расширений")
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
            {t(
              "Connections and scenarios are paused because the extension runner is unavailable.",
              "Подключения и сценарии приостановлены: исполнитель расширений недоступен.",
            )}{" "}
            {data.runtime.error}
          </AlertDescription>
        </Alert>
      ) : null}
      <>
        {!kind ? (
          <Card>
            <CardHeader>
              <CardTitle>
                {t("Install a package", "Установить пакет")}
              </CardTitle>
              <CardDescription>
                {t(
                  "Upload a .peek file or use an HTTPS release link. You will review all permissions before installation.",
                  "Загрузите файл .peek или укажите HTTPS-ссылку на релиз. Перед установкой вы увидите все разрешения.",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <SettingsField label={t("Package file", "Файл пакета")}>
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
                <SettingsField label={t("Release URL", "Ссылка на релиз")}>
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
                {t("Review package", "Проверить пакет")}
              </Button>
            </CardFooter>
          </Card>
        ) : null}
        {review ? (
          <Card>
            <CardHeader>
              <CardTitle>
                {t("Review installation", "Проверка установки")}
              </CardTitle>
              <CardDescription>
                {t(
                  "These packages have not been reviewed by Peek. A connection can use the permissions of the account you connect to it.",
                  "Эти пакеты не проверены Peek. Подключение сможет использовать права подключённого к ней аккаунта.",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul>
                {review.packages.map(({ manifest: m, sha256 }) => (
                  <li key={m.id}>
                    <strong>
                      {m.name} · {m.version}
                    </strong>
                    <p>
                      {m.id} — {m.author}
                    </p>
                    <p>{m.description}</p>
                    <p>
                      {m.kind === "scenario"
                        ? t(
                          "Scenario: selected data only; no network or secrets.",
                          "Сценарий: только выбранные данные, без сети и секретов.",
                        )
                        : m.permissions.internet
                          ? t(
                            "Connection: public internet access.",
                            "Подключение: доступ к публичному интернету.",
                          )
                          : t(
                            "Connection: no public internet access.",
                            "Подключение: без публичного интернета.",
                          )}
                    </p>
                    {m.permissions.local?.map((x) => (
                      <p key={`${x.address}:${x.port}`}>
                        {t("Local service", "Локальный сервис")}: {x.address}:
                        {x.port}
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
                {t("Accept and install", "Принять и установить")}
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
                {t("Cancel", "Отмена")}
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
                {o.status}:{" "}
                {o.error ??
                  t(
                    "Waiting for the extension runner",
                    "Ожидание исполнителя расширений",
                  )}
              </AlertDescription>
            </Alert>
          ))}
        {!data && !error && !loadError ? (
          <LoadingState>{t("Loading…", "Загрузка…")}</LoadingState>
        ) : null}
        {kind &&
          data &&
          !query.trim() &&
          !data.instances.some((i) => i.kind === kind) ? (
          <SettingsEmpty
            title={
              kind === "scenario"
                ? t("No scenarios yet", "Пока нет сценариев")
                : t("No connections yet", "Пока нет подключений")
            }
            description={t(
              "Use the add button to choose from the library.",
              "Нажмите кнопку добавления, чтобы выбрать из каталога.",
            )}
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
            <SettingsHeading
              title={t("Installed packages", "Установленные пакеты")}
            />
            {data?.packages.length === 0 && !query.trim() ? (
              <SettingsEmpty
                title={t(
                  "No packages installed yet.",
                  "Пакеты пока не установлены.",
                )}
              />
            ) : null}
            <SettingsGrid>
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
                  <SettingsCard
                    key={p.manifest.id}
                    title={p.manifest.name}
                    description={`${p.manifest.id} · ${p.manifest.version} · ${p.manifest.author}`}
                    actions={
                      <>
                        <Button variant="outline" asChild>
                          <Link href={createHref(p.manifest)}>
                            {p.manifest.kind === "scenario"
                              ? t("Create scenario", "Создать сценарий")
                              : t("Add connection", "Добавить подключение")}
                          </Link>
                        </Button>
                        <DeleteButton
                          locale={locale}
                          disabled={busy || !p.unused}
                          description={t(
                            "Remove this unused package?",
                            "Удалить этот неиспользуемый пакет?",
                          )}
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
                      {p.official
                        ? t("Official", "Официальное")
                        : t("Unreviewed", "Не проверено")}
                    </Badge>
                    <p>{p.manifest.description}</p>
                    {p.unused && !p.explicit ? (
                      <p>
                        {t(
                          "Unused dependency — can be removed.",
                          "Неиспользуемая зависимость — можно удалить.",
                        )}
                      </p>
                    ) : null}
                  </SettingsCard>
                ))}
            </SettingsGrid>
            <SettingsHeading
              title={t(
                "Configured scenarios and connections",
                "Настроенные сценарии и подключения",
              )}
            />
          </>
        ) : null}
        <SettingsGrid>
          {data?.instances
            .filter(
              (i) =>
                (!kind || i.kind === kind) &&
                matchesSearch(query, i.name, i.package_id),
            )
            .map((i) => (
              <SettingsCard
                key={i.id}
                title={
                  <Link
                    href={`/${i.kind === "scenario" ? "scenarios" : "connections"}/${encodeURIComponent(i.id)}`}
                  >
                    {i.name}
                  </Link>
                }
                description={
                  data.packages.find((p) => p.manifest.id === i.package_id)
                    ?.manifest.name ?? i.package_id
                }
                status={
                  <Badge variant={i.enabled ? "success" : "inactive"}>
                    {i.enabled
                      ? t("Enabled", "Включено")
                      : t("Disabled", "Выключено")}
                  </Badge>
                }
                actions={
                  <>
                    <Button variant="outline" asChild>
                      <Link
                        href={`/${i.kind === "scenario" ? "scenarios" : "connections"}/${encodeURIComponent(i.id)}`}
                      >
                        {t("Edit", "Изменить")}
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy || !i.enabled}
                      onClick={() =>
                        void perform(() => api({ action: "run", id: i.id }))
                      }
                    >
                      {i.kind === "scenario"
                        ? t("Update cards", "Обновить карточки")
                        : t("Refresh data", "Обновить данные")}
                    </Button>
                    <DeleteButton
                      locale={locale}
                      disabled={busy}
                      description={t(
                        "Delete this instance and its local data?",
                        "Удалить этот экземпляр и его локальные данные?",
                      )}
                      onConfirm={() =>
                        perform(() =>
                          api({ action: "delete-instance", id: i.id }),
                        )
                      }
                    />
                  </>
                }
              >
                {profiles?.filter((p) => p.id === i.profile_id)
                  .map((p) => (
                    <ProfileLabel key={p.id} profile={p} locale={locale} />
                  ))}
                {i.kind === "scenario" ? (
                  <p>
                    {[
                      ...new Set(
                        Object.values(i.bindings)
                          .flat()
                          .map(
                            (b) =>
                              data.connections.find(
                                (c) => c.id === b.connectionId,
                              )?.name,
                          )
                          .filter(Boolean),
                      ),
                    ].join(" · ")}
                  </p>
                ) : null}
                {i.last_error ? (
                  <Alert variant="destructive" role="status">
                    <AlertDescription>{i.last_error}</AlertDescription>
                  </Alert>
                ) : null}
                <SettingsCardDetails label={t("Update details", "Подробности обновления")}>
                  <dl className="grid gap-4">
                    <div className="grid gap-1">
                      <dt>{t("Last updated", "Последнее обновление")}</dt>
                      <dd className="text-foreground">
                        {i.last_success
                          ? new Date(i.last_success).toLocaleString(locale)
                          : t("Not updated yet", "Ещё не обновлялось")}
                      </dd>
                    </div>
                    {i.enabled ? (
                      <div className="grid gap-1">
                        <dt>{t("Next update", "Следующее обновление")}</dt>
                        <dd className="text-foreground">
                          {i.next_run_at
                            ? new Date(i.next_run_at).toLocaleString(locale)
                            : t("Waiting for updates", "Ожидание обновлений")}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </SettingsCardDetails>
              </SettingsCard>
            ))}
        </SettingsGrid>
        {!kind && data?.canRollback ? (
          <ConfirmAction
            locale={locale}
            disabled={busy}
            label={t(
              "Restore previous installation",
              "Восстановить предыдущую установку",
            )}
            description={t(
              "Restore the previous package set and its saved settings and state? Later configuration changes will be lost.",
              "Восстановить прежний набор пакетов, его настройки и состояние? Последующие изменения настроек будут потеряны.",
            )}
            onConfirm={() => perform(() => api({ action: "rollback" }))}
          />
        ) : null}
      </>
    </SettingsCollection>
  );
}
function InstanceEditor({
  manifest: m,
  item,
  connections,
  profiles,
  profilesError,
  locale,
  save,
}: {
  manifest: Manifest;
  item?: Item;
  connections: Status["connections"];
  profiles: Profile[] | null;
  profilesError: string;
  locale: "en" | "ru";
  save: (v: unknown) => Promise<void>;
}) {
  const t = (en: string, ru: string) => (locale === "ru" ? ru : en);
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
        .filter(
          ([, contract]) =>
            acceptsContract(m, requirement, contract),
        )
        .map(([dataset]) => ({
          connectionId: connection.id,
          name: connection.name,
          dataset,
        })),
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
        title={item?.name ?? `${t("Configure", "Настроить")} ${m.name}`}
        description={m.description}
        backHref={`/${m.kind === "scenario" ? "scenarios" : "connections"}`}
        backLabel={t("Back to list", "Назад к списку")}
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
              t(
                "Choose a compatible connection for",
                "Выберите совместимое подключение для",
              ) + ` ${missingInput.input}.`,
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
              enabled,
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
            <SettingsField label={t("Name", "Название")}>
              <Input
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </SettingsField>
            <SettingsField label={t("Profile", "Профиль")}>
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
                <LoadingState layout="fields">{t("Loading profiles…", "Загрузка профилей…")}</LoadingState>
              )}
            </SettingsField>
            <SettingsField label={t("Enabled", "Включено")}>
              <Checkbox
                checked={enabled}
                onCheckedChange={(v) => setEnabled(v === true)}
              />
            </SettingsField>
            <SchemaFields
              schema={m.settings}
              value={settings}
              onChange={setSettings}
            />
            {m.secrets ? (
              <>
                <SettingsField
                  label={t(
                    "Set credentials (leave unchecked to keep saved credentials)",
                    "Задать секреты (снимите флажок, чтобы сохранить текущие)",
                  )}
                >
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
                  {t("Connections", "Подключения")} ({input}){" "}
                  {requirement.optional
                    ? t("(optional)", "(необязательно)")
                    : ""}
                </FieldLegend>
                <FieldDescription id={`input-${input}-hint`}>
                  {requirement.optional
                    ? t("Optional connection.", "Необязательное подключение.")
                    : t(
                      "Select a compatible connection to save this scenario.",
                      "Выберите совместимое подключение, чтобы сохранить сценарий.",
                    )}
                </FieldDescription>
                {!choices.length ? (
                  <SettingsEmpty
                    title={t(
                      "No compatible connections",
                      "Нет совместимых подключений",
                    )}
                    description={
                      t(
                        "Add a connection that provides",
                        "Добавьте подключение, предоставляющее",
                      ) + ` ${requirement.contract} (${requirement.version}).`
                    }
                    action={
                      <Button variant="outline" asChild>
                        <Link href="/connections">
                          {t("Add connection", "Добавить подключение")}
                        </Link>
                      </Button>
                    }
                  />
                ) : (
                  choices.map((choice) => (
                    <SettingsField
                      key={`${choice.connectionId}:${choice.dataset}`}
                      label={choice.name}
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
            {busy ? t("Saving…", "Сохранение…") : t("Save", "Сохранить")}
          </Button>
          <Button variant="ghost" asChild>
            <Link
              href={`/${m.kind === "scenario" ? "scenarios" : "connections"}`}
              data-discard-changes
            >
              {t("Cancel", "Отмена")}
            </Link>
          </Button>
        </EditorActions>
      </EditorForm>
    </div>
  );
}
