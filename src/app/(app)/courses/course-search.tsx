"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { searchCatalog, type CatalogCourse, type CourseLevelValue } from "@/lib/courses/catalog";

// The course name field: type anything, and matching courses are suggested.
// Picking one fills in the name, subject, and level; any name not on the list
// works as a custom course. Follows the ARIA combobox pattern: arrow keys move
// through the options, Enter picks, Escape closes.

interface Props {
  value: string;
  level: CourseLevelValue | null;
  onChange: (name: string) => void;
  onPick: (course: CatalogCourse) => void;
}

export function CourseSearch({ value, level, onChange, onPick }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const suggestions = open ? searchCatalog(value, level) : [];
  const typed = value.trim();
  const exactMatch = suggestions.some((course) => course.title.toLowerCase() === typed.toLowerCase());
  const showCustom = open && typed.length > 0 && !exactMatch;
  const optionCount = suggestions.length + (showCustom ? 1 : 0);
  const expanded = open && optionCount > 0;

  function optionId(index: number) {
    return `${listId}-option-${index}`;
  }

  function choose(index: number) {
    if (index < suggestions.length) onPick(suggestions[index]);
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
      setOpen(false);
      setActive(-1);
    }
  }

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
        <ul
          id={listId}
          role="listbox"
          aria-label="Course suggestions"
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-sm shadow-md"
        >
          {suggestions.map((course, index) => (
            <li
              key={course.title}
              id={optionId(index)}
              role="option"
              aria-selected={active === index}
              // mousedown, not click: picking must happen before the input's blur closes the list.
              onMouseDown={(event) => {
                event.preventDefault();
                choose(index);
              }}
              className={cn("flex cursor-pointer items-baseline justify-between gap-3 rounded-md px-2.5 py-2", active === index && "bg-muted")}
            >
              <span>{course.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{course.subject}</span>
            </li>
          ))}
          {showCustom && (
            <li
              id={optionId(suggestions.length)}
              role="option"
              aria-selected={active === suggestions.length}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(suggestions.length);
              }}
              className={cn("cursor-pointer rounded-md px-2.5 py-2", active === suggestions.length && "bg-muted")}
            >
              Use &ldquo;{typed}&rdquo; as a custom course
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
