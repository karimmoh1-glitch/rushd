"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { resetTutorPreferences, updateTutorPreferences } from "@/server/actions/settings";
import { DEFAULT_PREFERENCES, MAX_INSTRUCTIONS, type TutorPreferences } from "@/lib/tutor/preferences";

type Choice<K extends keyof TutorPreferences> = { key: K; label: string; options: { value: TutorPreferences[K]; label: string }[] };

const CHOICES = [
  { key: "depth", label: "Explanation depth", options: [{ value: "brief", label: "Essentials" }, { value: "balanced", label: "Balanced" }, { value: "detailed", label: "Thorough" }] },
  { key: "length", label: "Reply length", options: [{ value: "short", label: "Short" }, { value: "medium", label: "Medium" }, { value: "long", label: "Long is fine" }] },
  { key: "approach", label: "How to help", options: [{ value: "hints_first", label: "Hints first" }, { value: "mixed", label: "Mix" }, { value: "worked_examples", label: "Worked examples" }] },
  { key: "difficulty", label: "Practice difficulty", options: [{ value: "easier", label: "Gentler" }, { value: "matched", label: "Matched" }, { value: "harder", label: "Push me" }] },
  { key: "tone", label: "Tone", options: [{ value: "encouraging", label: "Encouraging" }, { value: "neutral", label: "Neutral" }, { value: "direct", label: "Direct" }] },
] as const satisfies readonly Choice<keyof TutorPreferences>[];

const TOGGLES = [
  { key: "diagnosticFirst", label: "Ask me a quick diagnostic question before explaining a new topic" },
  { key: "challengeMe", label: "Push back when I'm wrong instead of agreeing" },
] as const;

const SELECTED_OPTION_CLASS = "rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground";
const OPTION_CLASS = "rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground";

const EXAMPLES = [
  "Explain concepts step by step.",
  "Help me understand why my answer is wrong before showing the right one.",
  "Use examples related to engineering.",
];

export function TutorPreferencesForm({ initial, instructions }: { initial: TutorPreferences; instructions: string }) {
  const [prefs, setPrefs] = useState<TutorPreferences>(initial);
  const [text, setText] = useState(instructions);
  const [pending, startTransition] = useTransition();

  // Append an example sentence to what the student already wrote.
  function addExample(example: string) {
    setText((current) => {
      const combined = current ? `${current.trim()} ${example}` : example;
      return combined.slice(0, MAX_INSTRUCTIONS);
    });
  }

  function save() {
    startTransition(async () => {
      const result = await updateTutorPreferences({ instructions: text, preferences: prefs });
      if ("error" in result) toast.error(result.error);
      else toast.success("Saved. The tutor and feedback use this from your next message.");
    });
  }

  function reset() {
    startTransition(async () => {
      const result = await resetTutorPreferences();
      if ("error" in result) {
        toast.error(result.error);
      } else {
        setPrefs(DEFAULT_PREFERENCES);
        setText("");
        toast.success("Reset to defaults.");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="tutor-instructions">In your own words</Label>
        <Textarea
          id="tutor-instructions"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_INSTRUCTIONS}
          rows={4}
          placeholder="e.g. Start with hints before giving me the solution. Challenge me instead of just agreeing."
        />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((example) => (
              <button key={example} type="button" onClick={() => addExample(example)} className="rounded-md border border-border px-2 py-0.5 hover:bg-muted">
                + {example}
              </button>
            ))}
          </span>
          <span className="tabular-nums">{text.length}/{MAX_INSTRUCTIONS}</span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {CHOICES.map((choice) => (
          <fieldset key={choice.key} className="space-y-1.5">
            <legend className="text-sm font-medium">{choice.label}</legend>
            <div className="inline-flex rounded-lg border border-border p-0.5">
              {choice.options.map((option) => {
                const selected = prefs[choice.key] === option.value;
                return (
                  <button
                    key={String(option.value)}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setPrefs((current) => ({ ...current, [choice.key]: option.value }))}
                    className={selected ? SELECTED_OPTION_CLASS : OPTION_CLASS}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="space-y-2">
        {TOGGLES.map((toggle) => (
          <label key={toggle.key} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={prefs[toggle.key]} onChange={(e) => setPrefs((current) => ({ ...current, [toggle.key]: e.target.checked }))} className="h-4 w-4 accent-[var(--primary)]" />
            {toggle.label}
          </label>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        These shape how Rushd&apos;s tutor, practice feedback, and rubric reviews talk to you. They can&apos;t turn off Rushd&apos;s
        safety and academic-integrity rules. They&apos;re sent to the AI provider with each request.
      </p>
      <div className="flex gap-2">
        <Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save tutor preferences"}</Button>
        <Button variant="ghost" onClick={reset} disabled={pending}>Reset</Button>
      </div>
    </div>
  );
}
