const QA: [string, string][] = [
  ["What is Rushd?", "A personal AI learning system for high school and college students. It brings your coursework into one place, tutors you from your own class materials, checks practice work and drafts, tracks which topics you've mastered, and builds a study plan around your deadlines."],
  ["Do I need Canvas?", "No. Canvas makes setup faster because Rushd imports your courses, deadlines, and materials (read-only). Without it, add assignments by hand, by typing a sentence, or from a screenshot."],
  ["Will Rushd do my homework?", "No. The tutor explains, asks questions, and gives feedback. It won't write essays, solve graded problems for you, or submit anything."],
  ["How accurate are mastery estimates?", "They're AI judgments of short checks, shown as a range with a confidence level. One check is a snapshot; Rushd's mastery picture comes from repeated checks over time, with recent work weighted more. They aren't grades."],
  ["What happens to my photos and drafts?", "Practice photos are sent to Anthropic's Claude to read and then discarded; only the results are saved. Drafts you submit for feedback are saved so you can compare revisions, and you can delete them anytime."],
  ["Is it free?", "Planning, Canvas sync, and mastery tracking are free, with a small monthly allowance of AI tutoring, checks, and reviews. Paid plans raise those allowances."],
  ["Can my school use Rushd?", "Rushd is built for individual students today. If you're an educator interested in a pilot, see the Schools page; it lists what's available now and what isn't."],
];

export function FAQ() {
  return (
    <div className="mt-8 divide-y divide-border border-y border-border">
      {QA.map(([q, a]) => (
        <details key={q} className="group py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
            {q}
            <span aria-hidden="true" className="text-muted-foreground transition-transform group-open:rotate-45">+</span>
          </summary>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{a}</p>
        </details>
      ))}
    </div>
  );
}

export function faqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: QA.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
}
