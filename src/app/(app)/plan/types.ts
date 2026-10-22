import type { ReasonCode } from "@/lib/planning/types";

export interface AgendaBlock {
  key: string;
  kind: "assignment" | "exam";
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
