export const ACADEMIC_CHALLENGES = [
  "TOO_MANY_ASSIGNMENTS",
  "PROCRASTINATION",
  "POOR_TIME_ESTIMATION",
  "EXAM_STRESS",
  "STAYING_ORGANIZED",
] as const;

export type AcademicChallengeValue = (typeof ACADEMIC_CHALLENGES)[number];

export const CHALLENGE_OPTIONS: { value: AcademicChallengeValue; label: string; body: string }[] = [
  {
    value: "TOO_MANY_ASSIGNMENTS",
    label: "Too many assignments",
    body: "Everything piles up and it's hard to see what's actually due first.",
  },
  {
    value: "PROCRASTINATION",
    label: "Procrastination",
    body: "You know what to do, but starting is the hard part.",
  },
  {
    value: "POOR_TIME_ESTIMATION",
    label: "Poor time estimation",
    body: "Things always seem to take longer than you expect.",
  },
  {
    value: "EXAM_STRESS",
    label: "Stress before exams",
    body: "Prep tends to get crammed into the last day or two.",
  },
  {
    value: "STAYING_ORGANIZED",
    label: "Staying organized",
    body: "Deadlines live in too many different places at once.",
  },
];
