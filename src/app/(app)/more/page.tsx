import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, GraduationCap, ListChecks, Settings, Target, Upload } from "lucide-react";

export const metadata: Metadata = { title: "More" };

const LINKS = [
  { href: "/courses", label: "Courses", detail: "Modules, materials, rubrics", icon: BookOpen },
  { href: "/assignments", label: "Assignments", detail: "Everything due, with feedback", icon: ListChecks },
  { href: "/exams", label: "Exams", detail: "Upcoming tests", icon: GraduationCap },
  { href: "/mastery", label: "Mastery", detail: "What you know and what to review", icon: Target },
  { href: "/import", label: "Import from a screenshot", detail: "Add work from a photo of a calendar", icon: Upload },
  { href: "/settings", label: "Settings", detail: "Profile, plan, tutor, Canvas", icon: Settings },
];

export default function MorePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-[1.75rem] font-medium leading-tight tracking-tight">More</h1>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/60">
              <l.icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <span>
                <span className="block text-sm font-medium">{l.label}</span>
                <span className="block text-xs text-muted-foreground">{l.detail}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
