import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, MessageSquareText } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { getMaterial } from "@/lib/course/retrieval";
import { formatDateInZone } from "@/lib/time/zone";
import { buttonVariants } from "@/components/ui/button";
import { RubricTable } from "@/components/course/rubric-table";

export const metadata: Metadata = { title: "Course material" };

const KIND_LABEL = { PAGE: "Page", ASSIGNMENT: "Assignment", ANNOUNCEMENT: "Announcement", MODULE_ITEM: "Module item" } as const;

export default async function MaterialPage({ params }: { params: Promise<{ id: string; materialId: string }> }) {
  const user = await requireUser();
  const { id, materialId } = await params;
  const m = await getMaterial(user.id, materialId, { classId: id });
  if (!m) notFound();

  return (
    <article className="max-w-3xl space-y-6">
      <header className="space-y-2">
        <Link href={`/classes/${m.classId}`} className="text-sm text-muted-foreground hover:text-foreground">
          {m.className}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{m.title}</h1>
        <p className="text-sm text-muted-foreground">
          {KIND_LABEL[m.kind]}
          {m.postedAt && ` · ${m.kind === "ASSIGNMENT" ? "Due" : "Posted"} ${formatDateInZone(m.postedAt, user.profile?.timezone, { month: "short", day: "numeric", year: "numeric" })}`}
          {m.pointsPossible != null && ` · ${m.pointsPossible} points`}
          {" · Mirrored from Canvas"}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {m.url && (
            <a href={m.url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline" })}>
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Open in Canvas
            </a>
          )}
          <Link href={`/tutor?classId=${m.classId}`} className={buttonVariants({ variant: "outline" })}>
            <MessageSquareText className="h-4 w-4" aria-hidden="true" />
            Ask the tutor
          </Link>
        </div>
      </header>
      {m.body ? (
        <div className="whitespace-pre-wrap text-[15px] leading-relaxed">{m.body}</div>
      ) : (
        <p className="text-sm text-muted-foreground">Canvas didn&apos;t provide any text for this item.</p>
      )}
      {m.kind === "ASSIGNMENT" && (
        <section aria-labelledby="rubric-heading" className="space-y-3">
          <h2 id="rubric-heading" className="text-base font-semibold">Rubric</h2>
          {m.rubric ? <RubricTable rubric={m.rubric} /> : <p className="text-sm text-muted-foreground">No rubric was published in Canvas for this assignment.</p>}
        </section>
      )}
    </article>
  );
}
