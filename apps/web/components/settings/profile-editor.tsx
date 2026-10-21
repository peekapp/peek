"use client";
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
            <div className="form-grid">
              <label>
                {t.profileName}
                <input
                  required
                  maxLength={100}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setStatus("");
                  }}
                />
              </label>
              <label>
                {t.ownerColor}
                <select
                  value={color}
                  onChange={(e) => {
                    setColor(e.target.value as Profile["color"]);
                    setStatus("");
                  }}
                >
                  {(["blue", "pink", "green"] as const).map((c) => (
                    <option key={c} value={c}>
                      {t[c]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
          <div className="form-actions">
            <button disabled={status === "saving"}>
              {status === "saving" ? t.saving : t.save}
            </button>
            <Link href="/settings/profiles">{t.cancel}</Link>
            {profile ? (
              <button
                type="button"
                className="quiet-button danger"
                onClick={async () => {
                  if (!confirm(t.confirmProfileDelete)) return;
                  try {
                    await mutate({ action: "profile-delete", id: profile.id });
                    await refresh();
                    router.push("/settings/profiles");
                  } catch (e) {
                    setStatus(e instanceof Error ? e.message : "error");
                  }
                }}
              >
                {t.remove}
              </button>
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
