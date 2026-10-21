import Link from "next/link";
import { profileName, type Profile } from "@peek/core/profiles";
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
    <label>
      {t.profileOwner}
      <select
        required
        aria-label={t.profileOwner}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {!profiles.some((p) => p.id === value) ? (
          <option value={value} disabled>
            {t.profileMissing}
          </option>
        ) : null}
        {profiles.map((p) => (
          <option value={p.id} key={p.id}>
            {profileName(p, locale)}
          </option>
        ))}
      </select>
      <small>
        <Link href="/settings/profiles" target="_blank" rel="noopener">
          {t.profiles}
        </Link>
      </small>
    </label>
  );
}
