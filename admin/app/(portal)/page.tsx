import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { Stat } from "@/components/stat";
import { Table, Td } from "@/components/table";
import { requireStaff } from "@/lib/auth";
import { count, firstProblem, rows } from "@/lib/query";
import { daysAgoIso, formatShare } from "@/lib/stats";
import { OUTCOMES, type Device, type Profile } from "@/lib/types";

export default async function OverviewPage() {
  const { supabase } = await requireStaff();
  const since = daysAgoIso(7);
  const head = { count: "exact", head: true } as const;

  const [profiles, devices, attempts, correct, attempts7, tutor7, sessions7, ...byOutcome] = await Promise.all([
    rows<Pick<Profile, "role" | "requested_role">>(supabase.from("profiles").select("role, requested_role")),
    rows<Device>(supabase.from("devices").select("*").order("last_sync_at", { ascending: false })),
    count(supabase.from("attempts").select("*", head)),
    count(supabase.from("attempts").select("*", head).eq("verdict", "correct")),
    count(supabase.from("attempts").select("*", head).gte("created_at", since)),
    count(supabase.from("guidance_events").select("*", head).gte("created_at", since)),
    count(supabase.from("sessions").select("*", head).gte("started_at", since)),
    ...OUTCOMES.map((o) => count(supabase.from("guidance_events").select("*", head).eq("outcome", o))),
  ]);

  const problem = firstProblem(profiles, devices, attempts, correct, attempts7, tutor7, sessions7, ...byOutcome);
  const roleCount = (role: string) => profiles.data.filter((p) => p.role === role).length;
  const pending = profiles.data.filter((p) => p.role === "student" && p.requested_role === "teacher").length;
  const tutorTotal = byOutcome.reduce((sum, o) => sum + o.data, 0);

  return (
    <>
      <PageHeader title="Overview" description="Activity synced from the tablets." problem={problem} />

      <Section title="Accounts">
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Students" value={roleCount("student") - pending} />
          <Stat label="Teachers" value={roleCount("teacher")} />
          <Stat label="Admins" value={roleCount("admin")} />
          <Stat
            label="Pending teacher requests"
            value={pending}
            note={pending > 0 ? "Review them on the Users page." : undefined}
          />
        </dl>
      </Section>

      <Section title="Learning">
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Attempts" value={attempts.data} />
          <Stat label="Share correct" value={formatShare(correct.data, attempts.data)} />
          <Stat label="Tutor requests" value={tutorTotal} />
          <Stat label="Tablets" value={devices.data.length} />
        </dl>
      </Section>

      <Section title="Last 7 days">
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Stat label="Sessions started" value={sessions7.data} />
          <Stat label="Attempts" value={attempts7.data} />
          <Stat label="Tutor requests" value={tutor7.data} />
        </dl>
      </Section>

      <Section title="Tutor requests by outcome">
        <Table
          caption="Tutor requests by outcome"
          head={["Outcome", "Requests"]}
          empty="No tutor requests yet."
          isEmpty={tutorTotal === 0}
        >
          {OUTCOMES.map((outcome, i) => (
            <tr key={outcome}>
              <Td>{outcome}</Td>
              <Td numeric>{byOutcome[i]?.data ?? 0}</Td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Tablets and their last sync">
        <Table
          caption="Tablets and their last sync"
          head={["Tablet", "App version", "Last sync"]}
          empty="No tablet has synced yet."
          isEmpty={devices.data.length === 0}
        >
          {devices.data.map((d) => (
            <tr key={d.id}>
              <Td>{d.label}</Td>
              <Td>{d.app_version || "–"}</Td>
              <Td>
                <LocalTime iso={d.last_sync_at} />
              </Td>
            </tr>
          ))}
        </Table>
        <p className="mt-2 text-sm">
          <Link href="/devices" className="text-brand-700 underline">
            All tablet details
          </Link>
        </p>
      </Section>
    </>
  );
}
