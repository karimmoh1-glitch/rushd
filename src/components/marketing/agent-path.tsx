import { BookOpen, Compass, Crosshair, MessageSquareText, PlayCircle } from "lucide-react";

// The hero visual: what the agent does, drawn as the Rushd path. These are
// capabilities, not example data. A light travels the path on a loop and
// each point brightens as it passes (CSS only; still under reduced motion).

const STEPS = [
  { icon: BookOpen, title: "Learns your courses", text: "Canvas, notes, rubrics, or anything you add" },
  { icon: MessageSquareText, title: "Teaches and quizzes you", text: "Explains from your class's own material" },
  { icon: Crosshair, title: "Finds the exact gap", text: "From quizzes and photos of your work" },
  { icon: PlayCircle, title: "Picks what to watch", text: "Videos and practice for that one gap" },
  { icon: Compass, title: "Moves you ahead", text: "Tracks mastery and plans your next step" },
];

export function AgentPath() {
  return (
    <figure className="relative rounded-2xl border border-border bg-card p-7 shadow-[0_1px_0_hsl(var(--shadow-tint)/0.04),0_30px_60px_-40px_hsl(var(--shadow-tint)/0.45)] sm:p-9">
      <figcaption className="mb-7 flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        <span>What your agent does</span>
        <span lang="ar" dir="rtl" className="font-arabic text-base normal-case tracking-normal text-foreground/70">رُشد</span>
      </figcaption>
      <ol className="agent-path relative [--path-len:336px]" aria-label="What Rushd does">
        <span aria-hidden="true" className="intro-rail absolute left-[15px] top-[18px] h-[336px] w-px bg-foreground/20" style={{ ["--i" as string]: 0 }} />
        <span aria-hidden="true" className="agent-light absolute left-[11px] top-[14px] h-[9px] w-[9px] rounded-full bg-signal" />
        {STEPS.map((s, i) => {
          const last = i === STEPS.length - 1;
          return (
            <li key={s.title} className={`relative flex gap-5 ${last ? "" : "h-[84px]"}`} style={{ ["--n" as string]: i }}>
              <span aria-hidden="true" className="relative z-10 flex h-[31px] w-[31px] shrink-0 items-center justify-center">
                <span
                  className={`intro-node agent-node block rounded-full ${last ? "h-[15px] w-[15px] bg-signal" : "h-[11px] w-[11px] border-2 border-foreground bg-background"}`}
                  style={{ ["--i" as string]: i, ["--sx" as string]: `${(i % 2 ? -1 : 1) * (30 + i * 12)}px`, ["--sy" as string]: `${(i - 2) * 14}px` }}
                />
              </span>
              <div className="intro-late pt-1" style={{ ["--i" as string]: i - 3 }}>
                <p className="flex items-center gap-2.5 text-[17px] font-medium tracking-tight">
                  {s.title}
                  <s.icon className="h-4 w-4 text-muted-foreground/70" aria-hidden="true" />
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
