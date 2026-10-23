import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

// The building blocks the signed-in pages share, so Progress, Profile,
// Practice, Settings and the integration pages read as one product with Today.

/** Page title, optional back link, one-line description, and a slot for the page's action. */
export function PageHeader({
  title,
  description,
  back,
  action,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  back?: { href: string; label: string };
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="space-y-2">
      {back && (
        <Link href={back.href} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] font-medium leading-tight tracking-tight">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </header>
  );
}

/** A titled card, the same surface as Today's panels. */
export function Panel({
  id,
  title,
  description,
  aside,
  icon: Icon,
  tone = "default",
  className,
  children,
}: {
  id: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  aside?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  /** "danger" gives destructive actions their own, clearly separate surface. */
  tone?: "default" | "danger";
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn(
        "scroll-mt-24 rounded-xl bg-card px-4 py-4 shadow-(--shadow-card) ring-1 sm:px-5 sm:py-5",
        tone === "danger" ? "ring-destructive/30" : "ring-foreground/[0.07]",
        className,
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id={`${id}-title`}
            className={cn("flex items-center gap-2 text-[15px] font-semibold tracking-tight", tone === "danger" && "text-destructive")}
          >
            {Icon && <Icon className="h-4 w-4 text-muted-foreground" aria-hidden={true} />}
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/** One number with what it counts. */
export function StatTile({ value, label, className }: { value: React.ReactNode; label: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl bg-card px-4 py-3.5 shadow-(--shadow-card) ring-1 ring-foreground/[0.07]", className)}>
      <p className="font-display text-[1.75rem] font-medium leading-none tracking-tight tabular-nums">{value}</p>
      <p className="mt-2 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/** A row inside a panel list that belongs to one course: its color as a rule. */
export function CourseRow({ color, children, className }: { color: string; children: React.ReactNode; className?: string }) {
  return (
    <li
      style={{ ["--course" as string]: color }}
      className={cn("flex items-center justify-between gap-3 py-2.5", className)}
    >
      <span aria-hidden="true" className="course-rule h-8 w-1 shrink-0 rounded-full" />
      {children}
    </li>
  );
}
