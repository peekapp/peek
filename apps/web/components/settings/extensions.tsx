"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Json, Manifest, Schema } from "@peekapp/sdk";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
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
import { Brand } from "../brand";
type Binding = { connectionId: string; dataset: string };
type Item = {
  id: string;
  package_id: string;
  name: string;
  profile_id: string;
  enabled: number;
  settings: Json;
  bindings: Record<string, Binding[]>;
  hasSecret: boolean;
  last_error: string | null;
  last_success: number | null;
};
type Status = {
  packages: { manifest: Manifest; explicit: boolean; unused: boolean }[];
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
              <select
                value={JSON.stringify(value[key] ?? s.enum[0])}
                onChange={(e) => update(JSON.parse(e.target.value))}
              >
                {s.enum.map((v) => (
                  <option key={JSON.stringify(v)} value={JSON.stringify(v)}>
                    {String(v)}
                  </option>
                ))}
              </select>
            ) : s.type === "boolean" ? (
              <input
                type="checkbox"
                checked={value[key] === true}
                onChange={(e) => update(e.target.checked)}
              />
            ) : ["string", "integer", "number"].includes(s.type ?? "") ? (
              <Input
                type={
                  secret ? "password" : s.type === "string" ? "text" : "number"
                }
                step={s.type === "integer" ? 1 : "any"}
                required={required}
                autoComplete={secret ? "new-password" : "off"}
                value={String(value[key] ?? "")}
                onChange={(e) =>
                  update(
                    s.type === "string"
                      ? e.target.value
                      : e.target.value === ""
                        ? null
                        : Number(e.target.value),
                  )
                }
              />
            ) : (
              <textarea
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
export function Extensions({ locale }: { locale: "en" | "ru" }) {
  const ru = locale === "ru",
    t = (en: string, other: string) => (ru ? other : en);
  const [data, setData] = useState<Status | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [url, setUrl] = useState("");
  const [review, setReview] = useState<{
    id: string;
    packages: { manifest: Manifest; sha256: string }[];
  } | null>(null);
  const [profiles, setProfiles] = useState<{ id: string; name: string }[]>([]);
  const [editor, setEditor] = useState<{
    manifest: Manifest;
    item?: Item;
  } | null>(null);
  async function refresh() {
    const r = await fetch("/api/extensions", { cache: "no-store" });
    if (!r.ok) throw new Error("extensions-unavailable");
    setData(await r.json());
  }
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [r, s] = await Promise.all([
          fetch("/api/extensions", { cache: "no-store" }),
          fetch("/api/settings", { cache: "no-store" }),
        ]);
        if (!r.ok || !s.ok) throw new Error("extensions-unavailable");
        const [status, settings] = await Promise.all([r.json(), s.json()]);
        if (active) {
          setData(status);
          setProfiles(settings.profiles);
        }
      } catch (e) {
        if (active) setError(String(e));
      }
    }
    void load();
    const timer = setInterval(() => {
      if (active) void refresh().catch(() => {});
    }, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
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
  return (
    <main className="settings-page">
      <header className="settings-header">
        <Link className="settings-brand" href="/">
          <Brand />
        </Link>
        <Link href="/settings/scenarios">← {t("Settings", "Настройки")}</Link>
      </header>
      <div className="settings-heading">
        <h1>{t("Extensions", "Расширения")}</h1>
        <p>
          {t(
            "Install scenarios and integrations, then choose their connections.",
            "Устанавливайте сценарии и интеграции, затем выбирайте подключения.",
          )}
        </p>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription role="alert">{error}</AlertDescription>
        </Alert>
      ) : null}
      {data && !data.runtime.ready ? (
        <Alert>
          <AlertDescription>
            {t(
              "Extension runner is unavailable. Packages will run only when container isolation is ready.",
              "Исполнитель расширений недоступен. Запуск возможен только после проверки контейнерной изоляции.",
            )}{" "}
            {data.runtime.error}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("Install a package", "Установить пакет")}</CardTitle>
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
        {review ? (
          <Card>
            <CardHeader>
              <CardTitle>
                {t("Review installation", "Проверка установки")}
              </CardTitle>
              <CardDescription>
                {t(
                  "These packages have not been reviewed by Peek. An integration can use the permissions of the account you connect to it.",
                  "Эти пакеты не проверены Peek. Интеграция сможет использовать права подключённого к ней аккаунта.",
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
                              "Integration: public internet access.",
                              "Интеграция: доступ к публичному интернету.",
                            )
                          : t(
                              "Integration: no public internet access.",
                              "Интеграция: без публичного интернета.",
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
            <CardFooter className="gap-2">
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
        {editor ? (
          <InstanceEditor
            key={editor.item?.id ?? editor.manifest.id}
            manifest={editor.manifest}
            item={editor.item}
            connections={data?.connections ?? []}
            profiles={profiles}
            locale={locale}
            cancel={() => setEditor(null)}
            save={async (instance) => {
              await api({ action: "save", instance });
              setEditor(null);
              await refresh();
            }}
          />
        ) : null}
        <h2>{t("Installed packages", "Установленные пакеты")}</h2>
        {data?.packages.length === 0 ? (
          <p>
            {t(
              "No external packages installed yet.",
              "Внешние пакеты пока не установлены.",
            )}
          </p>
        ) : null}
        {data?.packages.map((p) => (
          <Card key={p.manifest.id}>
            <CardHeader>
              <CardTitle>{p.manifest.name}</CardTitle>
              <CardDescription>
                {p.manifest.id} · {p.manifest.version} · {p.manifest.author}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Badge variant="outline">{t("Unreviewed", "Не проверено")}</Badge>
              <p>{p.manifest.description}</p>
              {p.unused && !p.explicit ? (
                <p>
                  {t(
                    "Unused dependency — can be removed.",
                    "Неиспользуемая зависимость — можно удалить.",
                  )}
                </p>
              ) : null}
            </CardContent>
            <CardFooter className="gap-2">
              <Button onClick={() => setEditor({ manifest: p.manifest })}>
                {p.manifest.kind === "scenario"
                  ? t("Create scenario", "Создать сценарий")
                  : t("Add connection", "Добавить подключение")}
              </Button>
              <Button
                variant="outline"
                disabled={busy || !p.unused}
                onClick={() =>
                  void perform(() =>
                    api({ action: "delete-package", id: p.manifest.id }),
                  )
                }
              >
                {t("Remove package", "Удалить пакет")}
              </Button>
            </CardFooter>
          </Card>
        ))}
        <h2>
          {t(
            "Configured scenarios and connections",
            "Настроенные сценарии и подключения",
          )}
        </h2>
        {data?.instances.map((i) => (
          <Card key={i.id}>
            <CardHeader>
              <CardTitle>{i.name}</CardTitle>
              <CardDescription>
                {i.package_id} ·{" "}
                {i.enabled
                  ? t("Enabled", "Включено")
                  : t("Disabled", "Выключено")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {i.last_error ? <p role="status">{i.last_error}</p> : null}
              <p>
                {t("Last successful run", "Последний успешный запуск")}:{" "}
                {i.last_success
                  ? new Date(i.last_success).toLocaleString(locale)
                  : "—"}
              </p>
            </CardContent>
            <CardFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  setEditor({
                    manifest: data.packages.find(
                      (p) => p.manifest.id === i.package_id,
                    )!.manifest,
                    item: i,
                  })
                }
              >
                {t("Edit", "Изменить")}
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      t(
                        "Delete this instance and its local data?",
                        "Удалить этот экземпляр и его локальные данные?",
                      ),
                    )
                  )
                    void perform(() =>
                      api({ action: "delete-instance", id: i.id }),
                    );
                }}
              >
                {t("Delete", "Удалить")}
              </Button>
            </CardFooter>
          </Card>
        ))}
        {data?.canRollback ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              if (
                confirm(
                  t(
                    "Restore the previous package set and its saved settings and state? Later configuration changes will be lost.",
                    "Восстановить прежний набор пакетов, его настройки и состояние? Последующие изменения настроек будут потеряны.",
                  ),
                )
              )
                void perform(() => api({ action: "rollback" }));
            }}
          >
            {t(
              "Restore previous installation",
              "Восстановить предыдущую установку",
            )}
          </Button>
        ) : null}
      </div>
    </main>
  );
}
function InstanceEditor({
  manifest: m,
  item,
  connections,
  profiles,
  locale,
  cancel,
  save,
}: {
  manifest: Manifest;
  item?: Item;
  connections: Status["connections"];
  profiles: { id: string; name: string }[];
  locale: "en" | "ru";
  cancel: () => void;
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
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {item ? t("Edit", "Изменить") : t("Configure", "Настроить")} {m.name}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          id="extension-instance"
          onSubmit={async (e) => {
            e.preventDefault();
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
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
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
              <select
                value={profile}
                onChange={(e) => setProfile(e.target.value)}
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </SettingsField>
            <SettingsField label={t("Enabled", "Включено")}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
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
                  <input
                    type="checkbox"
                    checked={changeSecrets}
                    onChange={(e) => setChangeSecrets(e.target.checked)}
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
            {Object.entries(m.inputs ?? {}).map(([input, requirement]) => (
              <fieldset key={input}>
                <legend>
                  {input} · {requirement.contract}{" "}
                  {requirement.optional
                    ? t("(optional)", "(необязательно)")
                    : ""}
                </legend>
                {connections.flatMap((c) =>
                  Object.entries(c.contracts)
                    .filter(
                      ([, contract]) => contract.id === requirement.contract,
                    )
                    .map(([dataset]) => {
                      const checked = (bindings[input] ?? []).some(
                        (b) => b.connectionId === c.id && b.dataset === dataset,
                      );
                      return (
                        <label
                          className="flex items-center gap-2"
                          key={`${c.id}:${dataset}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const rest = (bindings[input] ?? []).filter(
                                (b) =>
                                  b.connectionId !== c.id ||
                                  b.dataset !== dataset,
                              );
                              setBindings({
                                ...bindings,
                                [input]: e.target.checked
                                  ? [
                                      ...(requirement.multiple ? rest : []),
                                      { connectionId: c.id, dataset },
                                    ]
                                  : rest,
                              });
                            }}
                          />
                          {c.name} · {dataset}
                        </label>
                      );
                    }),
                )}
              </fieldset>
            ))}
            {error ? <p role="alert">{error}</p> : null}
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="gap-2">
        <Button type="submit" form="extension-instance" disabled={busy}>
          {t("Save", "Сохранить")}
        </Button>
        <Button variant="outline" onClick={cancel}>
          {t("Cancel", "Отмена")}
        </Button>
      </CardFooter>
    </Card>
  );
}
