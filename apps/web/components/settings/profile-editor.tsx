"use client";
import { Label } from "../ui/label";
import { DeleteButton } from "./delete-button";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { SettingsField } from "./form-field";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { FieldGroup, FieldSet, FieldLegend } from "../ui/field";
import { profileColors, type ProfileColor } from "@peek/core/colors";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { profileName, type Profile } from "@peek/core/profiles";
import { messages, type Locale } from "@peek/core/i18n";
import { mutate, errorText } from "./api";
export function ProfileEditor({
  profile,
  locale,
  refresh,
}: {
  profile?: Profile;
  locale: Locale;
  refresh: () => Promise<void>;
}) {
  const t = messages(locale),
    router = useRouter();
  const [name, setName] = useState(profile?.name ?? "");
  const [color, setColor] = useState<Profile["color"]>(
    profile?.color ?? "blue",
  );
  const [status, setStatus] = useState("");
  return (
    <>
      <Link className="back-link" href="/settings/profiles">
        ← {t.backToProfiles}
      </Link>
      <div className="editor-title">
        <h1>{profile ? profileName(profile, locale) : t.addProfile}</h1>
      </div>
      {profile?.system ? (
        <p>{t.systemProfile}</p>
      ) : (
        <form
          className="detail-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setStatus("saving");
            try {
              const result = await mutate({
                action: "profile-save",
                id: profile?.id,
                config: { name, color },
              });
              await refresh();
              setStatus("saved");
              if (!profile) router.replace(`/settings/profiles/${result.id}`);
            } catch (e) {
              setStatus(e instanceof Error ? e.message : "error");
            }
          }}
        >
          <section className="form-section">
            <FieldGroup className="form-grid">
              <SettingsField label={t.profileName}>
                <Input
                  required
                  maxLength={100}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setStatus("");
                  }}
                />
              </SettingsField>
              <FieldSet className="profile-color-field">
                <FieldLegend variant="label">{t.ownerColor}</FieldLegend>
                <RadioGroup
                  className="color-swatches"
                  name="profile-color"
                  aria-label={t.ownerColor}
                  value={color}
                  onValueChange={(value) => {
                    setColor(value as ProfileColor);
                    setStatus("");
                  }}
                >
                  {(
                    Object.entries(profileColors) as [ProfileColor, string][]
                  ).map(([value, hex]) => (
                    <Label
                      className="color-swatch"
                      key={value}
                      title={t[value]}
                    >
                      <RadioGroupItem
                        className="color-swatch-control"
                        value={value}
                        aria-label={t[value]}
                      />
                      <span style={{ backgroundColor: hex }} aria-hidden="true">
                        {color === value ? "✓" : ""}
                      </span>
                    </Label>
                  ))}
                </RadioGroup>
              </FieldSet>
              <div className="profile-preview span-two" aria-label={t.preview}>
                <span className="preview-label">{t.preview}</span>
                <span className="owner">
                  <i
                    style={{ backgroundColor: profileColors[color] }}
                    aria-hidden="true"
                  />
                  {name.trim() || t.profileName}
                </span>
                <span className="preview-color-name">{t[color]}</span>
              </div>
            </FieldGroup>
          </section>
          <div className="form-actions">
            <Button disabled={status === "saving"}>
              {status === "saving" ? t.saving : t.save}
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/settings/profiles">{t.cancel}</Link>
            </Button>
            {profile ? (
              <DeleteButton
                locale={locale}
                description={t.confirmProfileDelete}
                disabled={status === "saving"}
                onConfirm={async () => {
                  try {
                    await mutate({ action: "profile-delete", id: profile.id });
                    await refresh();
                    router.push("/settings/profiles");
                  } catch (e) {
                    setStatus(e instanceof Error ? e.message : "error");
                  }
                }}
              />
            ) : null}
          </div>
          <p role="status" className="form-feedback">
            {status === "saved"
              ? t.saved
              : status && status !== "saving"
                ? errorText(status, locale)
                : ""}
          </p>
        </form>
      )}
    </>
  );
}
