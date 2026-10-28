import { Icon } from "@/components/icons";
import { signOut } from "@/lib/sign-out";

type Props = { variant?: "default" | "sidebar" };

export function SignOutButton({ variant = "default" }: Props) {
  const className =
    variant === "sidebar"
      ? "inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-white/25 text-sm font-medium text-white transition-colors duration-150 hover:bg-white/10"
      : "btn btn-secondary";
  return (
    <form action={signOut}>
      <button type="submit" className={className}>
        <Icon name="logout" size={16} />
        Sign out
      </button>
    </form>
  );
}
