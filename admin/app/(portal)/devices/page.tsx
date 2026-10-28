import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import { PageHeader } from "@/components/page-header";
import { Table, Td } from "@/components/table";
import { requireStaff } from "@/lib/auth";
import { rows } from "@/lib/query";
import type { Device, Profile } from "@/lib/types";

export default async function DevicesPage() {
  const { supabase } = await requireStaff();
  const [devices, profiles] = await Promise.all([
    rows<Device>(supabase.from("devices").select("*").order("last_sync_at", { ascending: false })),
    rows<Pick<Profile, "id" | "learner_code">>(supabase.from("profiles").select("id, learner_code")),
  ]);
  const codeById = new Map(profiles.data.map((p) => [p.id, p.learner_code]));

  return (
    <>
      <PageHeader
        title="Tablets"
        description="Each tablet registers itself the first time it syncs."
        problem={devices.problem ?? profiles.problem}
      />
      <Table
        caption="Tablets"
        head={["Tablet", "Model", "App version", "Content versions", "First seen", "Last sync", "Last user"]}
        empty="No tablet has synced yet."
        isEmpty={devices.data.length === 0}
      >
        {devices.data.map((d) => {
          const code = d.last_user ? codeById.get(d.last_user) : null;
          return (
            <tr key={d.id}>
              <Td>{d.label}</Td>
              <Td>{d.model || "–"}</Td>
              <Td>{d.app_version || "–"}</Td>
              <Td>{d.content || "–"}</Td>
              <Td>
                <LocalTime iso={d.first_seen_at} />
              </Td>
              <Td>
                <LocalTime iso={d.last_sync_at} />
              </Td>
              <Td>
                {d.last_user && code ? (
                  <Link href={`/users/${d.last_user}`} className="text-brand-700 underline">
                    {code}
                  </Link>
                ) : (
                  "–"
                )}
              </Td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
