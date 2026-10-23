import type { ReasonCode, WorkKind } from "@/lib/planning/types";

export interface AgendaBlock {
  key: string;
  kind: WorkKind;
  itemId: string;
  title: string;
  className: string;
  classColor: string;
  date: string;
  startMinute: number;
  endMinute: number;
  minutes: number;
  pinned: boolean;
  blockId?: string;
  reasonCode: ReasonCode;
  reasons: string[];
  fromCanvas: boolean;
  dueLabel: string;
  /** The block is today (so "Skip today" applies). */
  isToday: boolean;
  /** The student's own estimate (assignment minutes or exam prep), for "Change estimate". */
  estimateMinutes: number;
}

export interface AgendaDay {
  date: string;
  label: string;
  dateLabel: string;
  isToday: boolean;
  availableMinutes: number;
  plannedMinutes: number;
  status: "none" | "open" | "balanced" | "full";
  blocks: AgendaBlock[];
}

export interface DayOption {
  date: string;
  label: string;
}
