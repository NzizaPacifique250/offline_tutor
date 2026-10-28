import Image from "next/image";
import { Icon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { Logo } from "@/components/shell";
import { SubmitButton } from "@/components/submit-button";
import { signIn } from "./actions";

const points = [
  "See who has been working and how far each student has got.",
  "Check which tablets have synced.",
  "Approve teacher accounts and change roles.",
];

const ERRORS: Record<string, string> = {
  missing: "Enter your email and password.",
  invalid: "That email or password is not right.",
  unavailable: "Sign-in is not available right now. Try again in a minute.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error: code } = await searchParams;
  const error = code ? (ERRORS[code] ?? ERRORS.invalid) : null;
  const describedBy = error ? "login-error" : undefined;
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      <div className="on-primary flex h-16 items-center gap-3 bg-primary px-4 text-white lg:hidden">
        <Logo />
        <span className="text-base font-semibold">Tutor admin</span>
      </div>

      <aside className="on-primary relative hidden flex-col justify-between overflow-hidden bg-primary p-12 text-white lg:flex">
        {/* The illustration covers the panel; navy fades in at the top and bottom so the white text stays readable. Already compressed (740 px WebP, 22 KB), so Next serves it as it is; lazy, so phones, which never show this panel, do not download it. */}
        <Image
          src="/images/login-illustration.webp"
          alt=""
          fill
          unoptimized
          loading="lazy"
          className="object-cover"
        />
        <div aria-hidden className="absolute inset-x-0 top-0 h-1/3 bg-linear-to-b from-primary via-primary/70 to-transparent" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-3/5 bg-linear-to-t from-primary from-40% via-primary/85 to-transparent" />
        <div className="relative flex items-center gap-3">
          <Logo />
          <div>
            <p className="text-base font-semibold">Tutor admin</p>
            <p className="text-xs text-white/75">Senior Six Advanced Mathematics</p>
          </div>
        </div>
        <div className="relative max-w-md">
          <p className="text-title font-semibold tracking-tight">Follow your class, tablet by tablet.</p>
          <ul className="mt-6 space-y-4 text-base text-white/85">
            {points.map((p) => (
              <li key={p} className="flex gap-3">
                <Icon name="check" className="mt-0.5 shrink-0" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="flex items-start justify-center bg-bg px-4 py-8 lg:items-center lg:py-12">
        <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-card lg:p-8">
          <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-muted">Use your teacher or admin account.</p>
          {error ? (
            <div className="mt-6">
              <Notice tone="problem" id="login-error">
                {error}
              </Notice>
            </div>
          ) : null}
          <form action={signIn} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                aria-describedby={describedBy}
                aria-invalid={error ? true : undefined}
                autoFocus={Boolean(error)}
                className="field mt-1"
              />
            </div>
            <div>
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                aria-describedby={describedBy}
                aria-invalid={error ? true : undefined}
                className="field mt-1"
              />
            </div>
            <SubmitButton pendingLabel="Signing in…" className="btn btn-primary btn-lg w-full">
              Sign in
            </SubmitButton>
          </form>
        </div>
      </main>
    </div>
  );
}
