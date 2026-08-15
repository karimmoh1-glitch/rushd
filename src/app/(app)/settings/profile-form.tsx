"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateProfile } from "@/server/actions/settings";

const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "Europe/London",
  "Asia/Riyadh",
  "Asia/Dubai",
];

export function ProfileForm({
  initial,
}: {
  initial: {
    displayName: string;
    grade: number | null;
    school: string;
    timezone: string;
    goals: string;
  };
}) {
  const [pending, startTransition] = useTransition();
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [grade, setGrade] = useState(initial.grade ? String(initial.grade) : "");
  const [school, setSchool] = useState(initial.school);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [goals, setGoals] = useState(initial.goals);

  const timezoneOptions = COMMON_TIMEZONES.includes(timezone)
    ? COMMON_TIMEZONES
    : [timezone, ...COMMON_TIMEZONES];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateProfile({
        displayName,
        grade: grade ? Number(grade) : null,
        school: school || undefined,
        timezone,
        goals: goals || undefined,
      });
      if ("error" in result) toast.error(result.error);
      else toast.success("Profile updated.");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="settings-name">Display name</Label>
        <Input
          id="settings-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={60}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="settings-grade">Grade</Label>
          <Select value={grade} onValueChange={(v) => setGrade(v ?? "")}>
            <SelectTrigger id="settings-grade" className="w-full">
              <SelectValue placeholder="Prefer not to say">
                {(v: string) => (v ? `${v}th` : "Prefer not to say")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="9">9th</SelectItem>
              <SelectItem value="10">10th</SelectItem>
              <SelectItem value="11">11th</SelectItem>
              <SelectItem value="12">12th</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="settings-timezone">Timezone</Label>
          <Select value={timezone} onValueChange={(v) => v && setTimezone(v)}>
            <SelectTrigger id="settings-timezone" className="w-full">
              <SelectValue>
                {(v: string) => v.replace(/_/g, " ")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {timezoneOptions.map((tz) => (
                <SelectItem key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="settings-school">School (optional)</Label>
        <Input
          id="settings-school"
          value={school}
          onChange={(e) => setSchool(e.target.value)}
          maxLength={120}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="settings-goals">Academic goals (optional)</Label>
        <Textarea
          id="settings-goals"
          value={goals}
          onChange={(e) => setGoals(e.target.value)}
          maxLength={500}
          rows={3}
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
