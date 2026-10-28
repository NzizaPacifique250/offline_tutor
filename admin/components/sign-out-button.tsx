import { signOut } from "@/lib/sign-out";

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button
        type="submit"
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-100"
      >
        Sign out
      </button>
    </form>
  );
}
