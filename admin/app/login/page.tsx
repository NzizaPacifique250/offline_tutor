import { Notice } from "@/components/notice";
import { signIn } from "./actions";

const field =
  "mt-1 block w-full rounded-md border border-slate-400 bg-white px-3 py-2 text-base text-slate-900";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tutor admin</h1>
        <p className="mt-1 text-slate-600">Sign in with a teacher or admin account.</p>
      </div>
      {error ? <Notice tone="problem">{error}</Notice> : null}
      <form action={signIn} className="space-y-4">
        <div>
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input id="email" name="email" type="email" autoComplete="email" required className={field} />
        </div>
        <div>
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className={field} />
        </div>
        <button type="submit" className="w-full rounded-md bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700">
          Sign in
        </button>
      </form>
    </main>
  );
}
