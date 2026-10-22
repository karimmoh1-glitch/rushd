import type { RubricCriterion } from "@/lib/canvas/content";
import { rubricTotal } from "@/lib/canvas/content";

/** A Canvas rubric, exactly as Canvas published it. */
export function RubricTable({ rubric }: { rubric: RubricCriterion[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
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
  );
}
