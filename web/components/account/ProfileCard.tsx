"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import {
  cardClass,
  errorClass,
  inputClass,
  noticeClass,
  primaryBtn,
} from "./styles";

export function ProfileCard({
  name,
  email,
  verified,
  showVerification,
  role,
}: {
  name: string;
  email: string;
  verified: boolean;
  showVerification: boolean;
  role: string;
}) {
  const t = useTranslations("settings.profile");
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [resent, setResent] = useState(false);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const displayName = String(
      new FormData(e.currentTarget).get("name"),
    ).trim();
    const { error } = await authClient.updateUser({ name: displayName });
    setMsg(
      error ? { ok: false, text: t("error") } : { ok: true, text: t("saved") },
    );
    if (!error) router.refresh();
  }

  return (
    <section className={cardClass} aria-labelledby="profile-h">
      <h2 id="profile-h" className="text-lg font-bold">
        {t("title")}
      </h2>
      <form onSubmit={save} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t("name")}
          <input
            name="name"
            defaultValue={name}
            required
            maxLength={80}
            className={inputClass}
          />
        </label>
        <div className="flex flex-col gap-1.5 text-sm font-medium">
          {t("email")}
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-normal">{email}</span>
            {showVerification && (
              <>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${verified ? "bg-success-050 text-success" : "bg-warning-050 text-warning"}`}
                >
                  {verified ? t("verified") : t("unverified")}
                </span>
                {!verified && (
                  <button
                    type="button"
                    disabled={resent}
                    onClick={async () => {
                      await authClient.sendVerificationEmail({
                        email,
                        callbackURL: "/settings",
                      });
                      setResent(true);
                    }}
                    className="text-sm font-normal text-primary-700 hover:underline disabled:opacity-60"
                  >
                    {resent ? t("resent") : t("resend")}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        <div className="text-sm">
          <span className="font-medium">{t("role")}: </span>
          {t(`roles.${role}` as never)}
        </div>
        {msg && (
          <p
            role={msg.ok ? "status" : "alert"}
            className={msg.ok ? noticeClass : errorClass}
          >
            {msg.text}
          </p>
        )}
        <div>
          <button type="submit" className={primaryBtn}>
            {t("save")}
          </button>
        </div>
      </form>
    </section>
  );
}
