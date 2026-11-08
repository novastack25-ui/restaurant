"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Building2, Check, Palette, Printer, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useLanguage } from "@/components/language-provider";
import type { TranslationKey } from "@/i18n/en";

const settingsNav: { href: string; labelKey: TranslationKey; icon: typeof Building2 }[] = [
  { href: "/admin/settings", labelKey: "businessProfile", icon: Building2 },
  { href: "/admin/settings/printing", labelKey: "printing", icon: Printer },
  { href: "/admin/settings/branding", labelKey: "branding", icon: Palette },
  { href: "/admin/settings/notifications", labelKey: "notifications", icon: Bell },
  { href: "/admin/settings/security", labelKey: "security", icon: ShieldCheck },
];

export default function SettingsPage() {
  const pathname = usePathname();
  const { t, locale } = useLanguage();
  const ar = locale === "ar";
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState("");
  const [nameSaved, setNameSaved] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((result) => {
        if (active && result?.session?.name) setName(result.session.name as string);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  async function saveAccountName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingName(true);
    setNameError("");
    setNameSaved(false);
    try {
      const response = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? (ar ? "تعذر حفظ اسم الحساب." : "Could not save account name."));
      setName(result.name);
      setNameSaved(true);
      window.dispatchEvent(new Event("erp:profile-updated"));
    } catch (error) {
      setNameError(error instanceof Error ? error.message : (ar ? "تعذر حفظ اسم الحساب." : "Could not save account name."));
    } finally {
      setSavingName(false);
    }
  }

  return (
    <AppShell title={t("settings")} description={t("businessProfileDescription")}>
      <div className="grid lg:grid-cols-[240px_1fr] gap-5">
        <aside className="card p-2 h-fit">
          <nav className="space-y-1">
            {settingsNav.map((item) => {
              const active = pathname === item.href || (item.href !== "/admin/settings" && pathname.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 h-11 rounded-xl text-sm transition ${active ? "bg-primary-soft text-primary font-bold" : "text-muted hover:bg-background"}`}
                >
                  <Icon size={18} />
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </nav>
        </aside>
        <section className="card p-5 sm:p-7">
          <div className="mb-8 border-b border-border pb-7">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary"><UserRound size={19} /></span>
              <div>
                <h2 className="text-xl font-bold">{ar ? "اسم الحساب" : "Account name"}</h2>
                <p className="text-sm text-muted mt-1">{ar ? "غيّر الاسم الظاهر في لوحة الإدارة." : "Change the name shown in the admin panel."}</p>
              </div>
            </div>
            <form onSubmit={saveAccountName} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex-1">
                <span className="text-sm font-semibold block mb-2">{ar ? "الاسم" : "Name"}</span>
                <input className="input w-full" value={name} onChange={(event) => { setName(event.target.value); setNameSaved(false); }} minLength={2} maxLength={100} required />
              </label>
              <button className="btn-primary" disabled={savingName}>{savingName ? (ar ? "جارٍ الحفظ…" : "Saving…") : t("save")}</button>
            </form>
            {nameError && <p role="alert" className="mt-3 text-sm text-red-700">{nameError}</p>}
            {nameSaved && <p role="status" className="mt-3 flex items-center gap-2 text-sm text-green-700"><Check size={16} />{ar ? "تم تحديث اسم الحساب." : "Account name updated."}</p>}
          </div>
          <h2 className="text-xl font-bold">{t("businessProfile")}</h2>
          <p className="text-sm text-muted mt-1">{t("businessProfileDescription")}</p>
          <div className="grid sm:grid-cols-2 gap-5 mt-7">
            <Field label="Business name (English)" value="Sheikh Al Kar" />
            <Field label="اسم النشاط (العربية)" value="شيخ الكار" rtl />
            <Field label="Tax number" value="310048229" />
            <Field label="Phone number" value="+970 59 123 4567" />
            <label className="sm:col-span-2">
              <span className="text-sm font-semibold block mb-2">Address</span>
              <input className="input" defaultValue="Ramallah, Palestine" />
            </label>
            <Field label="Currency" value="₪ — Israeli New Shekel" />
            <Field label="Timezone" value="Asia/Hebron (GMT+3)" />
          </div>
          <div className="mt-7 pt-5 border-t border-border flex justify-end">
            <button className="btn-primary">{t("save")}</button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function Field({ label, value, rtl }: { label: string; value: string; rtl?: boolean }) {
  return (
    <label>
      <span className="text-sm font-semibold block mb-2">{label}</span>
      <input className="input" defaultValue={value} dir={rtl ? "rtl" : undefined} />
    </label>
  );
}
