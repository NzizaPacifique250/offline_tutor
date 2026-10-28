import { Notice } from "@/components/notice";
import { getSession } from "@/lib/auth";
import { SetupNeeded } from "@/components/setup-needed";
import { SETUP_MESSAGE } from "@/lib/query";

type Props = {
  title: string;
  description?: string;
  problem?: string | null;
  breadcrumb?: React.ReactNode;
  actions?: React.ReactNode;
  avatar?: React.ReactNode;
  badges?: React.ReactNode;
  /** Adds a line saying times are shown in Kigali time. */
  kigaliTime?: boolean;
};

export async function PageHeader({ title, description, problem, breadcrumb, actions, avatar, badges, kigaliTime }: Props) {
  const isAdmin = problem ? (await getSession()).profile?.role === "admin" : false;
  return (
    <header className="mb-6">
      {breadcrumb ? <div className="mb-4">{breadcrumb}</div> : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          {avatar}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-title font-semibold tracking-tight text-ink">{title}</h1>
              {badges}
            </div>
            {description ? <p className="mt-2 max-w-2xl text-base text-muted">{description}</p> : null}
            {kigaliTime ? <p className="mt-1 text-xs text-muted">Times are shown in Kigali time.</p> : null}
          </div>
        </div>
        {actions}
      </div>
      {problem ? (
        <div className="mt-4">
          {problem === SETUP_MESSAGE ? (
            <SetupNeeded />
          ) : (
            <Notice tone="problem" lead="Some data could not be loaded.">
              {isAdmin ? problem : "Try again in a minute. If it keeps happening, tell an admin."}
            </Notice>
          )}
        </div>
      ) : null}
    </header>
  );
}
