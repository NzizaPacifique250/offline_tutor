import { RoleProvider } from "@/components/role-context";
import { Shell } from "@/components/shell";
import { requireStaff } from "@/lib/auth";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireStaff();
  return (
    <Shell name={profile.full_name} code={profile.learner_code} role={profile.role}>
      <RoleProvider role={profile.role}>{children}</RoleProvider>
    </Shell>
  );
}
