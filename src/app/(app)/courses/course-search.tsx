"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { levelLabel, type CatalogRecord, type CourseLevelValue } from "@/lib/courses/catalog";
import { groupByLevel, isExactMatch, searchCourses } from "@/lib/courses/catalog/search";

// The course name field: type anything, and matching catalog courses are
// suggested, grouped by level and labeled so similar courses (AP Calculus AB,
// college Calculus I) are easy to tell apart. Picking one fills in the name,
// subject, and level; any name not on the list works as a custom course.
// Follows the ARIA combobox pattern: arrows move, Enter picks, Escape closes.

interface Props {
  value: string;
  /** The level set in the form, else the student's own level: ranks related courses first. */
  level: CourseLevelValue | null;
  onChange: (name: string) => void;
  onPick: (course: CatalogRecord, level: CourseLevelValue) => void;
}

export function CourseSearch({ value, level, onChange, onPick }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const hits = open ? searchCourses(value, { prefer: level, limit: 8 }) : [];
  const groups = groupByLevel(hits);
  const flat = groups.flatMap((group) => group.hits);
  const typed = value.trim();
  const exactMatch = flat.some((hit) => isExactMatch(hit.record, typed));
  const showCustom = open && typed.length > 0 && !exactMatch;
  const optionCount = flat.length + (showCustom ? 1 : 0);
  const expanded = open && optionCount > 0;

  function optionId(index: number) {
    return `${listId}-option-${index}`;
  }

  function choose(index: number) {
    if (index < flat.length) onPick(flat[index].record, flat[index].level);
    // The custom option keeps exactly what was typed.
    setOpen(false);
    setActive(-1);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((current) => (optionCount === 0 ? -1 : (current + 1) % optionCount));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => (optionCount === 0 ? -1 : (current - 1 + optionCount) % optionCount));
    } else if (event.key === "Enter" && expanded && active >= 0) {
      event.preventDefault();
      choose(active);
    } else if (event.key === "Escape" && expanded) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setActive(-1);
    }
  }

  // Each group's first option index.
  const starts = groups.map((_, i) => groups.slice(0, i).reduce((sum, group) => sum + group.hits.length, 0));

  return (
    <div className="relative">
      <Input
        id="class-name"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        placeholder="Search, e.g. AP Chemistry, or type your own"
        maxLength={80}
        autoComplete="off"
        required
        autoFocus
      />
      {expanded && (
        <div
          id={listId}
          role="listbox"
          aria-label="Course suggestions"
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-sm shadow-(--shadow-pop)"
        >
          {groups.map((group, groupIndex) => {
            const start = starts[groupIndex];
            const headerId = `${listId}-group-${group.level}`;
            const official = group.hits.every((hit) => hit.record.kind === "official");
            return (
              <div key={group.level} role="group" aria-labelledby={headerId}>
                <div id={headerId} className="flex justify-between gap-2 px-2.5 pb-0.5 pt-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  <span>{levelLabel(group.level)}</span>
                  <span className="normal-case tracking-normal">{official ? group.hits[0].record.provider : "Generic templates"}</span>
                </div>
                {group.hits.map((hit, i) => {
                  const index = start + i;
                  return (
                    <div
                      key={hit.record.id}
                      id={optionId(index)}
                      role="option"
                      aria-selected={active === index}
                      // mousedown, not click: picking must happen before the input's blur closes the list.
                      onMouseDown={(event) => {
                        event.preventDefault();
                        choose(index);
                      }}
                      className={cn("cursor-pointer rounded-md px-2.5 py-2", active === index && "bg-muted")}
                    >
                      <span className="block">{hit.record.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {[hit.record.subject, hit.record.descriptor].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {showCustom && (
            <div
              id={optionId(flat.length)}
              role="option"
              aria-selected={active === flat.length}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(flat.length);
              }}
              className={cn("cursor-pointer rounded-md px-2.5 py-2", active === flat.length && "bg-muted")}
            >
              Use &ldquo;{typed}&rdquo; as a custom course
            </div>
          )}
        </div>
      )}
    </div>
  );
}
