import type { RubricCriterion } from "@/lib/canvas/content";
import { rubricTotal } from "@/lib/canvas/content";

/** A Canvas rubric, exactly as Canvas published it. A table on wider screens;
 * on phones the same criteria as a list, so no column is cut off. */
export function RubricTable({ rubric }: { rubric: RubricCriterion[] }) {
  return (
    <>
      <RubricList rubric={rubric} />
      <div className="hidden overflow-x-auto rounded-lg border border-border sm:block">
      <table className="w-full min-w-[520px] text-sm">
        <caption className="sr-only">Rubric criteria and ratings</caption>
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Criterion</th>
            <th scope="col" className="px-3 py-2 font-medium">Ratings</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Points</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rubric.map((c) => (
            <tr key={c.id} className="align-top">
              <th scope="row" className="px-3 py-2.5 text-left font-medium">
                {c.description}
                {c.longDescription && <p className="mt-1 text-xs font-normal text-muted-foreground">{c.longDescription}</p>}
              </th>
              <td className="px-3 py-2.5">
                <ul className="space-y-1">
                  {c.ratings.map((r) => (
                    <li key={r.id} className="text-xs">
                      <span className="font-mono tabular-nums text-muted-foreground">{r.points}</span> {r.description}
                    </li>
                  ))}
                </ul>
              </td>
              <td className="px-3 py-2.5 text-right font-mono tabular-nums">{c.points}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border">
            <td colSpan={2} className="px-3 py-2 text-xs text-muted-foreground">Total</td>
            <td className="px-3 py-2 text-right font-mono tabular-nums">{rubricTotal(rubric)}</td>
          </tr>
        </tfoot>
      </table>
      </div>
    </>
  );
}

function RubricList({ rubric }: { rubric: RubricCriterion[] }) {
  return (
    <div className="rounded-lg border border-border sm:hidden">
      <ul aria-label="Rubric criteria and ratings" className="divide-y divide-border">
        {rubric.map((c) => (
          <li key={c.id} className="px-3 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium">{c.description}</p>
              <span className="shrink-0 font-mono text-sm tabular-nums">
                {c.points}
                <span className="sr-only"> points</span>
              </span>
            </div>
            {c.longDescription && <p className="mt-1 text-xs text-muted-foreground">{c.longDescription}</p>}
            {c.ratings.length > 0 && (
              <ul className="mt-2 space-y-1">
                {c.ratings.map((r) => (
                  <li key={r.id} className="flex gap-2 text-xs">
                    <span className="w-6 shrink-0 font-mono tabular-nums text-muted-foreground">{r.points}</span>
                    <span>{r.description}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <div className="flex justify-between border-t border-border px-3 py-2 text-xs">
        <span className="text-muted-foreground">Total</span>
        <span className="font-mono text-sm tabular-nums">{rubricTotal(rubric)}</span>
      </div>
    </div>
  );
}
