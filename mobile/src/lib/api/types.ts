// Response shapes of Rushd's /api/v1 (see docs/API.md and docs/openapi.json
// in the web repo). Kept by hand; the server is the source of truth.

export type DueStatus = "overdue" | "today" | "soon" | "later";
export type Priority = "LOW" | "MEDIUM" | "HIGH";
export type AssignmentStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
export type Difficulty = "EASIER" | "AS_EXPECTED" | "HARDER";
export type AbandonReason =
  | "RAN_OUT_OF_TIME"
  | "HARDER_THAN_EXPECTED"
  | "GOT_DISTRACTED"
  | "NEED_HELP"
  | "SOMETHING_CAME_UP"
  | "OTHER";

export interface TokenPair {
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  tokenType: "Bearer";
}

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  timeZone: string | null;
  onboardingCompleted: boolean;
  createdAt: string;
}

export interface Today {
  timeZone: string;
  date: string;
  dateLabel: string;
  overdueCount: number;
  dueThisWeek: number;
  minutesStudiedThisWeek: number;
  nextUp: {
    itemId: string;
    kind: "assignment" | "exam";
    assignmentId: string | null;
    examId: string | null;
    title: string;
    courseName: string;
    courseColor: string;
    minutes: number;
    pulse: number;
    plannedLabel: string | null;
    reasons: string[];
  } | null;
  todayBlocks: {
    itemId: string;
    kind: "assignment" | "exam";
    title: string;
    courseName: string;
    courseColor: string;
    minutes: number;
    startMinute: number | null;
    timeLabel: string | null;
    pinned: boolean;
    reasons: string[];
  }[];
  plannedMinutesToday: number;
  todayEmpty: {
    hasWork: boolean;
    noAvailability: boolean;
    availableMinutesToday: number;
    laterBlock: { title: string; when: string } | null;
  };
  comingUp: {
    id: string;
    kind: "assignment" | "exam";
    title: string;
    courseName: string;
    courseColor: string;
    at: string;
    dueStatus: DueStatus;
    dueLabel: string;
    fromCanvas: boolean;
    pulse: number | null;
  }[];
  week: {
    show: boolean;
    plannedMinutes: number;
    shortfallMinutes: number;
    days: { date: string; label: string; letter: string; minutes: number; availableMinutes: number }[];
  };
  courseStudyTime: { id: string; name: string; color: string; minutes: number; goalMinutes: number | null }[];
}

export interface Assignment {
  id: string;
  title: string;
  course: { id: string; name: string; color: string };
  dueAt: string;
  dueStatus: DueStatus;
  dueLabel: string;
  estimatedMinutes: number;
  priority: Priority;
  status: AssignmentStatus;
  notes: string | null;
  source: "MANUAL" | "CANVAS" | "TEAMS" | "CALENDAR";
  completedAt: string | null;
  removedUpstream: boolean;
  pulse: number | null;
}

export type TermProgress =
  | { state: "upcoming" }
  | { state: "running"; percent: number; week: number; weeks: number }
  | { state: "ended" };

export interface Course {
  id: string;
  name: string;
  color: string;
  level: string | null;
  levelLabel: string | null;
  code: string | null;
  institution: string | null;
  subject: string | null;
  teacher: string | null;
  period: string | null;
  priority: Priority;
  archived: boolean;
  termStart: string | null;
  termEnd: string | null;
  term: TermProgress | null;
  weeklyGoalMinutes: number | null;
  openAssignmentCount: number;
  upcomingExamCount: number;
  studiedMinutesLast7Days: number;
}

export interface CourseDetail {
  course: Course;
  openAssignments: Assignment[];
  upcomingExams: { id: string; title: string; examAt: string; dueStatus: DueStatus; dueLabel: string; prepMinutes: number }[];
}

export interface ActiveSession {
  id: string;
  title: string;
  className: string;
  classColor: string;
  plannedMinutes: number;
  startedAt: string;
}

export interface SessionSummary {
  title: string;
  plannedMinutes: number;
  actualMinutes: number;
  perceivedDifficulty: Difficulty | null;
}

export interface NewAssignment {
  courseId: string;
  title: string;
  dueAt: string;
  estimatedMinutes?: number;
  priority?: Priority;
  notes?: string;
}
