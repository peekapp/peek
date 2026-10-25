"use client";
import { EditorForm, FormFeedback } from "./layout";
import { EditorHeader, EditorSection, EditorActions } from "./layout";
import { ProfileLabel, ProfileIdentity } from "../profile-label";
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
import { type Profile } from "@peek/core/profiles";
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
      <EditorHeader
        title={
          profile ? (
            <ProfileLabel profile={profile} locale={locale} />
          ) : (
            t.addProfile
          )
        }
        backHref="/profiles"
        backLabel={t.backToProfiles}
      />
      {profile?.system ? (
        <p>{t.systemProfile}</p>
      ) : (
        <EditorForm
          draft={{ name, color }}
          locale={locale}
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
              if (!profile) router.replace(`/profiles/${result.id}`);
              return true;
            } catch (e) {
              setStatus(e instanceof Error ? e.message : "error");
              return false;
            }
          }}
        >
          <EditorSection>
            <FieldGroup>
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
              <FieldSet className="min-w-0">
                <FieldLegend variant="label">{t.ownerColor}</FieldLegend>
                <RadioGroup
                  className="flex flex-wrap gap-2"
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
                      className="relative block size-10 cursor-pointer"
                      key={value}
                      title={t[value]}
                    >
                      <RadioGroupItem
                        className="peer absolute inset-0 size-10 cursor-pointer opacity-0"
                        value={value}
                        aria-label={t[value]}
                      />
                      <span
                        className="m-1 grid size-8 place-items-center rounded-full text-xl text-background peer-data-[state=checked]:outline peer-data-[state=checked]:outline-foreground peer-data-[state=checked]:outline-offset-3 peer-focus-visible:outline-3 peer-focus-visible:outline-foreground peer-focus-visible:outline-offset-3"
                        style={{ backgroundColor: hex }}
                        aria-hidden="true"
                      >
                        {color === value ? "✓" : ""}
                      </span>
                    </Label>
                  ))}
                </RadioGroup>
              </FieldSet>
              <div
                className="flex flex-wrap items-center gap-5 rounded-md border border-border bg-background p-6 sm:col-span-2"
                aria-label={t.preview}
              >
                <span className="text-sm text-muted-foreground">
                  {t.preview}
                </span>
                <ProfileIdentity
                  name={name.trim() || t.profileName}
                  color={color}
                />
                <span className="ml-auto text-sm text-muted-foreground">
                  {t[color]}
                </span>
              </div>
            </FieldGroup>
          </EditorSection>
          <EditorActions>
            <Button disabled={status === "saving"}>
              {status === "saving" ? t.saving : t.save}
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/profiles" data-discard-changes>
                {t.cancel}
              </Link>
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
                    router.push("/profiles");
                  } catch (e) {
                    setStatus(e instanceof Error ? e.message : "error");
                  }
                }}
              />
            ) : null}
          </EditorActions>
          <FormFeedback role="status">
            {status === "saved"
              ? t.saved
              : status && status !== "saving"
                ? errorText(status, locale)
                : ""}
          </FormFeedback>
        </EditorForm>
      )}
    </>
  );
}
