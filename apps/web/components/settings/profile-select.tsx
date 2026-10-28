import { ProfileLabel } from "../profile-label";
import { SettingsSelect } from "./select";
import { SelectItem } from "../ui/select";
import { SettingsField } from "./form-field";
import Link from "next/link";
import { type Profile } from "@peek/core/profiles";
import { messages, type Locale } from "@peek/core/i18n";
export function ProfileSelect({
  profiles,
  value,
  locale,
  onChange,
}: {
  profiles: Profile[];
  value: string;
  locale: Locale;
  onChange: (id: string) => void;
}) {
  const t = messages(locale);
  return (
    <SettingsField label={t.profileOwner}>
      <SettingsSelect
        required
        aria-label={t.profileOwner}
        value={value}
        onValueChange={onChange}
      >
        {!profiles.some((p) => p.id === value) ? (
          <SelectItem value={value} disabled>
            {t.profileMissing}
          </SelectItem>
        ) : null}
        {profiles.map((p) => (
          <SelectItem value={p.id} key={p.id}>
            <ProfileLabel linked={false} profile={p} locale={locale} />
          </SelectItem>
        ))}
      </SettingsSelect>
      <small>
        <Link href="/profiles" target="_blank" rel="noopener">
          {t.profiles}
        </Link>
      </small>
    </SettingsField>
  );
}
