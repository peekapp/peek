"use client";
import { ProfileUsage, type ProfileUsageData } from "./profile-usage";
import { toast } from "sonner";
import { EditorForm, FormFeedback } from "./layout";
import { EditorPanel } from "./layout";
import { ProfileLabel, ProfileIdentity } from "../profile-label";
import { Label } from "../ui/label";
import { SettingsRowMenu } from "./row-menu";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { SettingsField } from "./form-field";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { FieldGroup, FieldSet, FieldLegend } from "../ui/field";
import { profileColors, type ProfileColor } from "@peek/core/colors";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { profileName, type Profile } from "@peek/core/profiles";
import { messages, type Locale } from "@peek/core/i18n";
import { mutate, errorText } from "./api";
export function ProfileEditor({
  profile,
  locale,
  onSaved,
  usage,
}: {
  profile?: Profile;
  usage?: ProfileUsageData;
  locale: Locale;
  onSaved: (profile: Profile) => void;
}) {
  const t = messages(locale),
    router = useRouter();
  const [name, setName] = useState(profile?.name ?? "");
  const [color, setColor] = useState<Profile["color"]>(
    profile?.color ?? "blue",
  );
  const [saved, setSaved] = useState({ name: profile?.name ?? "", color: profile?.color ?? "blue" });
  const [activePanel, setActivePanel] = useState("identity");
  const [status, setStatus] = useState("");
  const draft = { name, color };
  const usageButton = profile && usage ? <ProfileUsage profileId={profile.id} data={usage} locale={locale} /> : null;
  function panel(setting: "identity" | "color", title: string, description: string, children: ReactNode, headerAction?: ReactNode) {
    const Container = profile ? "form" : "div";
    const changed = setting === "identity" ? name !== saved.name : color !== saved.color;
    return <Container data-setting={setting}>
      <EditorPanel title={title} description={description} headerAction={setting === "identity" && profile ? <div className="flex items-center gap-2">{usageButton}{headerAction}</div> : headerAction}
        media={setting === "identity" ? <ProfileIdentity profileId={profile?.id} name={name.trim() || t.profileName} color={color} avatarOnly layout="header" /> : undefined}
        actions={profile ? <Button size="sm" type="submit" name="setting" value={setting} disabled={status === "saving" || !changed}>
          {status === "saving" && activePanel === setting ? t.saving : t.save}
        </Button> : undefined}>
        {children}
        {activePanel === setting && status && status !== "saving" ? <FormFeedback role="alert">{errorText(status, locale)}</FormFeedback> : null}
      </EditorPanel>
    </Container>;
  }
  return (
    <>
      {profile?.system ? (
        <EditorPanel title={profileName(profile, locale)} media={<ProfileLabel profile={profile} locale={locale} avatarOnly layout="header" />} headerAction={usageButton} description={t.systemProfile} />
      ) : (
        <EditorForm
          layout="settings"
          as={profile ? "div" : "form"}
          draft={draft}
          savedDraft={saved}
          locale={locale}
          onSubmit={async (e) => {
            e.preventDefault();
            const setting = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value;
            if (profile && setting !== "identity" && setting !== "color") return false;
            const next = profile ? { ...saved, ...(setting === "identity" ? { name: name.trim() } : { color }) } : { name: name.trim(), color };
            setActivePanel(setting || "identity");
            setStatus("saving");
            try {
              await mutate({
                action: "profile-save",
                id: profile?.id,
                config: next,
              });
              setSaved(next);
              if (!profile || setting === "identity") setName(next.name);
              if (profile) onSaved({ ...profile, ...next });
              setStatus("");
              toast.success(profile ? t.saved : t.profileCreated);
              if (!profile) router.replace("/profiles");
              return true;
            } catch (e) {
              setStatus(e instanceof Error ? e.message : "error");
              return false;
            }
          }}
        >
          <div className="flex flex-col gap-6">
          {panel("identity", t.profileName, t.profileIdentityDescription, <>
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
            </FieldGroup>
          </>, profile ? <SettingsRowMenu kind="profile" locale={locale} disabled={status === "saving"}
              relatedItems={usage ? <ProfileUsage profileId={profile.id} data={usage} locale={locale} variant="menu" /> : undefined}
              onDelete={async () => {
                setStatus("saving");
                try {
                  await mutate({ action: "profile-delete", id: profile.id });
                  toast.success(t.profileDeleted);
                  router.push("/profiles");
                } catch (error) {
                  throw new Error(errorText(error instanceof Error ? error.message : "error", locale));
                } finally { setStatus(""); }
              }} /> : undefined)}
          {panel("color", t.ownerColor, t.profileColorDescription, <>
              <FieldSet className="min-w-0">
                <FieldLegend className="sr-only">{t.ownerColor}</FieldLegend>
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
          </>)}
          </div>
          {!profile ? <div className="mt-6"><Button disabled={status === "saving"}>{status === "saving" ? t.saving : t.settingsCreate}</Button></div> : null}
        </EditorForm>
      )}
    </>
  );
}
