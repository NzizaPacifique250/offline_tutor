import Link from "next/link";
import { Badge } from "@/components/badge";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icons";
import { LocalTime } from "@/components/local-time";
import { PageHeader } from "@/components/page-header";
import { Rise } from "@/components/rise";
import { getClient, requireAdmin } from "@/lib/auth";
import { rows } from "@/lib/query";
import { syncStatus, timeAgo } from "@/lib/stats";
import type { Device, Profile } from "@/lib/types";

export default async function DevicesPage() {
  const supabase = await getClient();
  // The queries start together with the staff check, not after it.
  const [, devices, profiles] = await Promise.all([
    // Tablets are for admins; a teacher is sent to the overview.
    requireAdmin(),
    rows<Device>(supabase.from("devices").select("*").order("last_sync_at", { ascending: false })),
    rows<Pick<Profile, "id" | "learner_code">>(supabase.from("profiles").select("id, learner_code")),
  ]);
  const codeById = new Map(profiles.data.map((p) => [p.id, p.learner_code]));
  const recent = devices.data.filter((d) => syncStatus(d.last_sync_at).recent).length;
  const total = devices.data.length;

  return (
    <>
      <PageHeader
        title="Tablets"
        description="Each tablet registers itself the first time it syncs."
        problem={devices.problem ?? profiles.problem}
        kigaliTime
      />
      {total === 0 ? (
        <EmptyState
          title="No tablet has synced yet"
          body="Turn sync on in the tablet app under the topic list."
        />
      ) : (
        <>
          <p className="mb-4 text-base font-semibold">
            {recent} of {total} {total === 1 ? "tablet" : "tablets"} synced in the last 24 hours.
          </p>
          <ul className="grid gap-4 lg:grid-cols-2">
            {devices.data.map((d, i) => {
              const status = syncStatus(d.last_sync_at);
              const code = d.last_user ? codeById.get(d.last_user) : null;
              return (
                <li key={d.id}>
                  <Rise i={i}>
                    <Card className="h-full">
                      <div className="flex items-center gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tint text-primary">
                          <Icon name="tablet" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <h2 className="truncate text-base font-semibold">{d.label}</h2>
                          <p className="truncate text-sm text-muted">{d.model || "–"}</p>
                        </div>
                      </div>
                      <div className="mt-3">
                        <Badge tone={status.tone} icon={status.icon}>
                          {status.label}
                        </Badge>
                      </div>
                      <div className="mt-4">
                        <p className="text-xs text-muted">Last sync</p>
                        <p className="text-base font-semibold">{timeAgo(d.last_sync_at)}</p>
                        <p className="text-xs text-muted">
                          <LocalTime iso={d.last_sync_at} />
                        </p>
                      </div>
                      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 text-sm">
                        <div>
                          <dt className="text-xs text-muted">App version</dt>
                          <dd>{d.app_version || "–"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted">Content versions</dt>
                          <dd className="break-words">{d.content || "–"}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted">First seen</dt>
                          <dd>
                            <LocalTime iso={d.first_seen_at} />
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted">Last user</dt>
                          <dd>
                            {d.last_user && code ? (
                              <Link href={`/users/${d.last_user}`} className="link">
                                {code}
                              </Link>
                            ) : (
                              "–"
                            )}
                          </dd>
                        </div>
                      </dl>
                    </Card>
                  </Rise>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
