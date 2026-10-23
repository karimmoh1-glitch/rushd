import Link from "next/link";

/** The shared header of Assignments and Exams: title, what the list means, the
 * switch between the two, and a one-line summary of what's open. */
export function WorkHeader({
  current,
  title,
  description,
  action,
  summary,
  showImport,
}: {
  current: "assignments" | "exams";
  title: string;
  description: string;
  action: React.ReactNode;
  summary?: React.ReactNode;
  showImport?: boolean;
}) {
  const tabs = [
    { key: "assignments", href: "/assignments", label: "Assignments" },
    { key: "exams", href: "/exams", label: "Exams" },
  ] as const;
  return (
    <header className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] font-medium leading-tight tracking-tight">{title}</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="shrink-0">{action}</div>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-border">
        <nav aria-label="Work" className="-mb-px flex gap-5 text-sm">
          {tabs.map((tab) =>
            tab.key === current ? (
              <span key={tab.key} aria-current="page" className="border-b-2 border-signal pb-2.5 font-medium">
                {tab.label}
              </span>
            ) : (
              <Link
                key={tab.key}
                href={tab.href}
                className="border-b-2 border-transparent pb-2.5 text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
              >
                {tab.label}
              </Link>
            ),
          )}
          {showImport && (
            <Link
              href="/import"
              className="border-b-2 border-transparent pb-2.5 text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
            >
              Import from a screenshot
            </Link>
          )}
        </nav>
        {summary && <p className="pb-2.5 text-xs tabular-nums text-muted-foreground">{summary}</p>}
      </div>
    </header>
  );
}

/** A quiet group heading inside the list ("No longer in Canvas", "Completed", "Past"). */
export function WorkGroupHeading({ children, note }: { children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-medium text-muted-foreground">{children}</h2>
      {note && <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
