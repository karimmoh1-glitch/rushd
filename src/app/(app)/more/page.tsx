import type { Metadata } from "next";
import Link from "next/link";
import { aiEnabled } from "@/lib/env";
import { BookOpen, GraduationCap, ListChecks, Settings, Target, Upload } from "lucide-react";

export const metadata: Metadata = { title: "More" };

const LINKS = [
  { href: "/courses", label: "Courses", detail: "Modules, materials, rubrics", icon: BookOpen },
  { href: "/assignments", label: "Assignments", detail: "Everything due, with feedback", icon: ListChecks },
  { href: "/exams", label: "Exams", detail: "Upcoming tests", icon: GraduationCap },
  { href: "/mastery", label: "Mastery", detail: "What you know and what to review", icon: Target, ai: true },
  { href: "/import", label: "Import from a screenshot", detail: "Add work from a photo of a calendar", icon: Upload, ai: true },
  { href: "/settings", label: "Settings", detail: "Profile, plan, tutor, Canvas", icon: Settings },
];

export default function MorePage() {
  // AI-only links are hidden when AI features are off.
  const visibleLinks = LINKS.filter((link) => aiEnabled || !("ai" in link));

  return (
    <div className="space-y-6">
      <h1 className="text-[1.75rem] font-medium leading-tight tracking-tight">More</h1>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {visibleLinks.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/60">
              <link.icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <span>
                <span className="block text-sm font-medium">{link.label}</span>
                <span className="block text-xs text-muted-foreground">{link.detail}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
