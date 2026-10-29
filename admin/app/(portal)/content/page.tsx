import { Badge } from "@/components/badge";
import { Card } from "@/components/card";
import { ConfirmButton } from "@/components/confirm-button";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icons";
import { LocalTime } from "@/components/local-time";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Rise } from "@/components/rise";
import { SubmitButton } from "@/components/submit-button";
import { getClient, requireAdmin } from "@/lib/auth";
import { firstProblem, rows } from "@/lib/query";
import { releaseTablets } from "@/lib/releases";
import { timeAgo } from "@/lib/stats";
import type { ContentRelease, Device, Profile } from "@/lib/types";
import { publishRelease, setWithdrawn, updateRelease } from "./actions";

// Everything but the file itself, which only the download reads.
const COLUMNS =
  "id, package_id, version, unit, unit_title, lessons, exercises, notes, sha256, devices, published_by, published_at, withdrawn_at";

// The actions redirect here with short codes; the copy lives here.
const NOTICES: Record<string, string> = {
  published:
    "The release was published. A connected tablet looks for it when the app starts and every ten minutes; Check for updates in Teacher tools looks at once.",
  saved: "The release was saved.",
  withdrawn:
    "The release was withdrawn. Tablets are no longer offered it; a tablet that installed it keeps it until a newer version comes.",
  restored: "The release is offered to its tablets again.",
};
const ERRORS: Record<string, string> = {
  invalid: "That request was not valid.",
  "no-file": "Choose the release file to publish.",
  "too-large": "That file is over 2 MB, more than any lesson package needs. Check that it is a release file.",
  "long-notes": "Keep the notes to 500 characters.",
  "no-tablets": "Tick at least one tablet, or choose Every tablet.",
  "not-json": "That is not a release file: it is not valid JSON.",
  "not-package": "That is not a release file. Make one with tools/export_package.py.",
  incomplete: "The release file is missing part of the package, or has no lessons or exercises.",
  "bad-id": "The package id in the file must look like rw-s6-am.u4.",
  "bad-version": "The version in the file must be major.minor.patch, such as 0.3.0.",
  "bad-unit": "The unit in the file must be a whole number.",
  "not-newer":
    "That version is not newer than the unit's latest release. Raise the version in the unit's package.json, export it again and publish the new file.",
  setup: "Releases need migration 0006: run supabase/migrations/0006_lesson_updates.sql in the Supabase SQL Editor.",
  "publish-failed": "The release was not published. Try again.",
  "change-failed": "The release was not changed. Try again.",
};

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

type Props = { searchParams: Promise<{ notice?: string; error?: string }> };

export default async function ContentPage({ searchParams }: Props) {
  const { notice: noticeCode, error: errorCode } = await searchParams;
  const supabase = await getClient();
  // The queries start together with the admin check, not after it.
  const [, releases, devices, people] = await Promise.all([
    // Publishing lessons is for admins; a teacher is sent to the overview.
    requireAdmin(),
    rows<ContentRelease>(supabase.from("content_releases").select(COLUMNS).order("published_at", { ascending: false })),
    rows<Device>(supabase.from("devices").select("*").order("last_sync_at", { ascending: false })),
    rows<Pick<Profile, "id" | "full_name" | "learner_code">>(supabase.from("profiles").select("id, full_name, learner_code")),
  ]);
  const problem = firstProblem(releases, devices, people);
  const notice = noticeCode ? (NOTICES[noticeCode] ?? null) : null;
  const error = errorCode ? (ERRORS[errorCode] ?? "That did not work. Try again.") : null;
  const nameOf = new Map(people.data.map((p) => [p.id, p.full_name || p.learner_code]));

  return (
    <>
      <PageHeader
        title="Content"
        description="Publish new or corrected lessons to the tablets. A connected tablet with an older version of the unit offers to install it and keeps every student's progress; a tablet with no internet imports the downloaded file in Teacher tools."
        problem={problem}
        kigaliTime
      />
      {notice || error ? (
        <div className="mb-6 space-y-4">
          {notice ? <Notice tone="success">{notice}</Notice> : null}
          {error ? <Notice tone="problem">{error}</Notice> : null}
        </div>
      ) : null}

      <Rise>
        <Card title="Publish a release" className="mb-8">
          <p className="mb-5 max-w-3xl text-sm text-muted">
            Make the file on the development laptop: raise the unit&apos;s version in its <code>package.json</code>, then run{" "}
            <code>tools/export_package.py</code> on the unit&apos;s folder. It checks the package, proves every answer key and
            writes the file to <code>dist/content</code>.
          </p>
          <form action={publishRelease} className="space-y-5">
            <div>
              <label htmlFor="release-file" className="text-sm font-medium">
                Release file
              </label>
              <input
                id="release-file"
                name="file"
                type="file"
                required
                accept=".json,application/json"
                className="field mt-1 h-auto py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-tint file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink hover:file:bg-tint-strong"
              />
            </div>
            <Notes id="release-notes" />
            <TabletChoice id="publish" devices={devices.data} />
            <SubmitButton pendingLabel="Publishing…">Publish release</SubmitButton>
          </form>
        </Card>
      </Rise>

      <h2 className="mb-4 text-lg font-semibold">Releases</h2>
      {releases.data.length === 0 && !problem ? (
        <EmptyState
          icon="book"
          title="Nothing published yet"
          body="The tablets have the lessons that came in the app file. Publish a release above to add or correct a unit."
          compact
        />
      ) : (
        <ul className="grid gap-4 md:gap-6 xl:grid-cols-2">
          {releases.data.map((r, i) => (
            <li key={r.id}>
              <Rise i={i + 1}>
                <ReleaseCard
                  release={r}
                  devices={devices.data}
                  publisher={r.published_by ? (nameOf.get(r.published_by) ?? "a former account") : "a former account"}
                />
              </Rise>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ReleaseCard({ release: r, devices, publisher }: { release: ContentRelease; devices: Device[]; publisher: string }) {
  const tablets = releaseTablets(r, devices);
  const current = tablets.filter((t) => t.current).length;
  const withdrawn = Boolean(r.withdrawn_at);
  const title = `${r.unit_title || r.package_id} (Unit ${r.unit})`;
  return (
    <section aria-labelledby={`release-${r.id}`} className="h-full rounded-lg border border-line bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`release-${r.id}`} className="text-base font-semibold">
            {title}, version {r.version}
          </h3>
          <p className="text-sm text-muted">
            {plural(r.lessons, "lesson")}, {plural(r.exercises, "exercise")} · published <LocalTime iso={r.published_at} /> by{" "}
            {publisher}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {withdrawn ? (
            <Badge tone="neutral" icon="x">
              Withdrawn
            </Badge>
          ) : (
            <Badge tone="ok" icon="check">
              Offered
            </Badge>
          )}
          <Badge tone="info" icon="tablet">
            {r.devices.length ? plural(r.devices.length, "tablet") : "Every tablet"}
          </Badge>
        </div>
      </div>
      {r.notes ? <p className="mt-3 text-sm">{r.notes}</p> : null}

      <div className="mt-4 border-t border-line pt-4">
        {tablets.length === 0 ? (
          <p className="text-sm text-muted">No tablet it is for has synced yet, so none has reported its lessons.</p>
        ) : (
          <>
            <p className="text-sm font-medium">
              {current} of {plural(tablets.length, "tablet")} {tablets.length === 1 ? "has" : "have"} this version or newer
            </p>
            <ul className="mt-2 divide-y divide-line">
              {tablets.map((t) => (
                <li key={t.device.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                  <span className="min-w-0 truncate">
                    {t.device.label} <span className="text-muted">· synced {timeAgo(t.device.last_sync_at)}</span>
                  </span>
                  <Badge tone={t.current ? "ok" : "warn"} icon={t.current ? "check" : "clock"}>
                    {t.has ? `v${t.has}` : "Not installed"}
                  </Badge>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">As each tablet reported at its last sync.</p>
          </>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <a href={`/content/${r.id}/file`} download className="btn btn-secondary btn-sm">
          <Icon name="download" size={16} />
          Download file
        </a>
        <form action={setWithdrawn}>
          <input type="hidden" name="id" value={r.id} />
          {withdrawn ? (
            <SubmitButton pendingLabel="Offering…" className="btn btn-secondary btn-sm">
              Offer again
            </SubmitButton>
          ) : (
            <>
              <input type="hidden" name="withdraw" value="yes" />
              <ConfirmButton
                message={`Withdraw version ${r.version} of ${title}? Tablets that have not installed it are no longer offered it; those that have keep it until a newer version comes.`}
                className="btn btn-secondary btn-sm text-bad hover:bg-bad-soft active:bg-bad-soft"
              >
                Withdraw
              </ConfirmButton>
            </>
          )}
        </form>
        <span className="ml-auto font-mono text-xs text-muted" title={`SHA-256 ${r.sha256}`}>
          SHA-256 {r.sha256.slice(0, 12)}…
        </span>
      </div>

      <details className="mt-3">
        <summary className="link inline-flex cursor-pointer list-none items-center gap-1 text-sm [&::-webkit-details-marker]:hidden">
          <Icon name="pencil" size={16} />
          Change the notes or tablets
        </summary>
        <form action={updateRelease} className="mt-3 space-y-4">
          <input type="hidden" name="id" value={r.id} />
          <Notes id={`notes-${r.id}`} value={r.notes} />
          <TabletChoice id={r.id} devices={devices} chosen={r.devices} />
          <SubmitButton pendingLabel="Saving…" className="btn btn-secondary">
            Save
          </SubmitButton>
        </form>
      </details>
    </section>
  );
}

function Notes({ id, value = "" }: { id: string; value?: string }) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        What changed <span className="font-normal text-muted">(optional, shown on the tablets)</span>
      </label>
      <textarea
        id={id}
        name="notes"
        maxLength={500}
        rows={2}
        defaultValue={value}
        placeholder="A new lesson on powers of i, and a corrected hint."
        className="field mt-1 h-auto py-2"
      />
    </div>
  );
}

// Every tablet, or the ticked ones. The list shows only while Chosen tablets
// is selected, with CSS alone.
function TabletChoice({ id, devices, chosen = [] }: { id: string; devices: Device[]; chosen?: string[] }) {
  return (
    <fieldset className="group">
      <legend className="text-sm font-medium">Tablets</legend>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
        <label className="inline-flex min-h-8 items-center gap-2 text-sm">
          <input type="radio" name="audience" value="every" defaultChecked={chosen.length === 0} className="size-4 accent-primary" />
          Every tablet
        </label>
        <label className="inline-flex min-h-8 items-center gap-2 text-sm">
          <input
            type="radio"
            name="audience"
            value="chosen"
            defaultChecked={chosen.length > 0}
            disabled={devices.length === 0}
            className="size-4 accent-primary"
          />
          Chosen tablets
        </label>
      </div>
      {devices.length === 0 ? (
        <p className="mt-1 text-xs text-muted">Tablets can be chosen once they have synced; until then a release is for every tablet.</p>
      ) : (
        <ul id={`${id}-tablets`} className="mt-3 hidden gap-2 group-has-[input[value=chosen]:checked]:grid sm:grid-cols-2">
          {devices.map((d) => (
            <li key={d.id}>
              <label className="flex h-full cursor-pointer items-start gap-3 rounded-md border border-line p-3 text-sm hover:bg-tint">
                <input
                  type="checkbox"
                  name="devices"
                  value={d.id}
                  defaultChecked={chosen.includes(d.id)}
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                />
                <span className="min-w-0">
                  <span className="block font-medium">{d.label}</span>
                  <span className="block truncate text-xs text-muted">
                    {d.model || "–"} · synced {timeAgo(d.last_sync_at)}
                  </span>
                  <span className="block break-words text-xs text-muted">{d.content || "No lessons reported"}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
