"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { COURSE_LEVELS, catalogRecord, levelLabel, relatedLevels, type CatalogRecord, type CourseLevelValue } from "@/lib/courses/catalog";
import { browseCourses, groupByLevel, isExactMatch, normalize, scoreText, searchCourses } from "@/lib/courses/catalog/search";
import { pickCustom, pickRecord, type PickedCourse } from "@/lib/courses/picked";

// A command-palette course picker: type to search the catalog, Enter adds the
// highlighted course, keep typing to add more. Selected courses show as chips
// (Backspace in the empty field removes the last one). Follows the ARIA
// combobox pattern with a multi-select listbox; the list sits inline (not in
// a popover) so it works the same in a page, a dialog, and on a phone.

export interface OwnCourseSummary {
  name: string;
  catalogId: string | null;
  code: string | null;
  institution: string | null;
  archived: boolean;
}

interface Props {
  /** The student's level: related levels rank first and set the browse list. */
  studentLevel: CourseLevelValue | null;
  selected: PickedCourse[];
  onAdd: (course: PickedCourse) => void;
  onRemove: (key: string) => void;
  /** Catalog ids that enough real students chose (already thresholded on the server). */
  popularIds?: string[];
  /** The student's existing courses, newest first. */
  ownCourses?: OwnCourseSummary[];
  label?: string;
  placeholder?: string;
  autoFocus?: boolean;
  max?: number;
}

type Option =
  | { kind: "record"; record: CatalogRecord; level: CourseLevelValue; owned: boolean }
  | { kind: "custom"; title: string };

interface Section {
  id: string;
  label: string;
  note?: string;
  options: Option[];
}

const NONE = "\u0000none";

function isEnabled(option: Option): boolean {
  return !(option.kind === "record" && option.owned);
}

function optionKey(option: Option): string {
  return option.kind === "record" ? option.record.id : `custom:${normalize(option.title)}`;
}

/** "AP · Math · Limits, derivatives, integrals" */
function optionMeta(record: CatalogRecord, level: CourseLevelValue): string {
  return [levelLabel(level), record.subject, record.descriptor].filter(Boolean).join(" · ");
}

function groupNote(records: CatalogRecord[]): string {
  if (records.every((record) => record.kind === "official")) return records[0].provider ?? "Official";
  if (records.every((record) => record.kind === "template")) return "Generic templates";
  return "";
}

export function CoursePicker({
  studentLevel,
  selected,
  onAdd,
  onRemove,
  popularIds = [],
  ownCourses = [],
  label = "Search courses",
  placeholder = "Search courses, e.g. AP Chemistry",
  autoFocus = false,
  max = 20,
}: Props) {
  const baseId = useId();
  const listId = `${baseId}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CourseLevelValue | null>(null);
  // The highlighted option, by key, so it survives the list re-rendering.
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const selectedKeys = useMemo(() => new Set(selected.map((course) => course.key)), [selected]);
  const ownedIds = useMemo(() => new Set(ownCourses.filter((course) => !course.archived && course.catalogId).map((course) => course.catalogId!)), [ownCourses]);
  const typed = query.trim();
  const full = selected.length >= max;

  const sections: Section[] = useMemo(() => {
    const record = (r: CatalogRecord, level: CourseLevelValue): Option => ({ kind: "record", record: r, level, owned: ownedIds.has(r.id) });
    if (!typed) {
      const out: Section[] = [];
      const related = new Set(relatedLevels(studentLevel));
      const popular = popularIds
        .map((id) => catalogRecord(id))
        .filter((r): r is CatalogRecord => Boolean(r))
        .filter((r) => (filter ? r.levels.includes(filter) : related.size === 0 || r.levels.some((level) => related.has(level))))
        .slice(0, 5);
      if (popular.length > 0) {
        out.push({
          id: "popular",
          label: "Popular on Rushd",
          note: "Most often added by students",
          options: popular.map((r) => record(r, filter ?? pickRecord(r, studentLevel).level ?? r.levels[0])),
        });
      }
      const browseLevel = filter ?? (studentLevel && studentLevel !== "OTHER" ? studentLevel : null);
      if (browseLevel) {
        const shown = new Set(popular.map((r) => r.id));
        const browse = browseCourses(browseLevel, 6).filter((r) => !shown.has(r.id));
        if (browse.length > 0) {
          out.push({ id: "browse", label: `${levelLabel(browseLevel)} courses`, note: groupNote(browse), options: browse.map((r) => record(r, browseLevel)) });
        }
      }
      return out;
    }
    const hits = searchCourses(typed, { level: filter, prefer: studentLevel, limit: 10 });
    const out: Section[] = groupByLevel(hits).map((group) => ({
      id: `level-${group.level}`,
      label: levelLabel(group.level) ?? group.level,
      note: groupNote(group.hits.map((hit) => hit.record)),
      options: group.hits.map((hit) => record(hit.record, hit.level)),
    }));
    // A custom course is always one keystroke away unless the name is exactly a catalog title.
    const exact = hits.some((hit) => isExactMatch(hit.record, typed));
    if (!exact) out.push({ id: "custom", label: "Not listed?", options: [{ kind: "custom", title: typed }] });
    return out;
  }, [typed, filter, studentLevel, popularIds, ownedIds]);

  const options = useMemo(() => sections.flatMap((section) => section.options), [sections]);
  // Each section's first option index, for ids and highlighting.
  const offsets = sections.map((_, i) => sections.slice(0, i).reduce((sum, section) => sum + section.options.length, 0));

  // Typing highlights the best match so Enter adds it; an empty field highlights nothing.
  let active = activeKey ? options.findIndex((option) => optionKey(option) === activeKey) : -1;
  if (active < 0 && activeKey !== NONE) active = typed ? options.findIndex(isEnabled) : -1;

  useEffect(() => {
    if (active < 0) return;
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const ownMatches = typed
    ? ownCourses.filter((course) => !course.archived && scoreText(typed, [course.name, course.code, course.institution]) > 0).slice(0, 3)
    : ownCourses.filter((course) => !course.archived).slice(0, 4);

  function optionId(index: number) {
    return `${baseId}-opt-${index}`;
  }

  function toggle(option: Option) {
    if (!isEnabled(option)) return;
    const key = optionKey(option);
    if (selectedKeys.has(key)) {
      const course = selected.find((c) => c.key === key);
      onRemove(key);
      setAnnouncement(`Removed ${course?.title ?? "course"}.`);
      return;
    }
    if (full) {
      setAnnouncement(`You can add up to ${max} courses here.`);
      return;
    }
    const course = option.kind === "record" ? { ...pickRecord(option.record, studentLevel), level: option.level } : pickCustom(option.title, studentLevel);
    onAdd(course);
    setAnnouncement(`Added ${course.title}. ${selected.length + 1} selected.`);
    setQuery("");
    setActiveKey(null);
    inputRef.current?.focus();
  }

  function move(step: 1 | -1) {
    if (options.length === 0) return;
    let next = active;
    for (let tries = 0; tries < options.length; tries++) {
      next = (next + step + options.length) % options.length;
      if (isEnabled(options[next])) break;
    }
    setActiveKey(optionKey(options[next]));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Enter") {
      // Never submit a surrounding form from the search field.
      event.preventDefault();
      if (active >= 0 && options[active]) toggle(options[active]);
    } else if (event.key === "Backspace" && query === "" && selected.length > 0) {
      event.preventDefault();
      const last = selected[selected.length - 1];
      onRemove(last.key);
      setAnnouncement(`Removed ${last.title}.`);
    } else if (event.key === "Escape") {
      // First Escape clears the search; a second one is left to the dialog (if any).
      if (query) {
        event.preventDefault();
        event.stopPropagation();
        setQuery("");
        setActiveKey(null);
      } else if (active >= 0) {
        event.preventDefault();
        event.stopPropagation();
        setActiveKey(NONE);
      }
    }
  }

  const levelChips = useMemo(() => {
    const order = [...relatedLevels(studentLevel), ...COURSE_LEVELS.map((option) => option.value)];
    return [...new Set(order)].filter((level) => level !== "OTHER");
  }, [studentLevel]);

  const expanded = options.length > 0;

  return (
    <div className="min-w-0 space-y-3">
      {selected.length > 0 && (
        <ul aria-label="Selected courses" className="flex flex-wrap gap-1.5">
          {selected.map((course) => (
            <li
              key={course.key}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-border-strong bg-surface-2 py-1 pl-3 pr-1 text-sm"
            >
              <span className="truncate">{course.title}</span>
              {course.kind === "custom" && <span className="shrink-0 text-xs text-muted-foreground">custom</span>}
              <button
                type="button"
                onClick={() => {
                  onRemove(course.key);
                  setAnnouncement(`Removed ${course.title}.`);
                  inputRef.current?.focus();
                }}
                aria-label={`Remove ${course.title}`}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="overflow-hidden rounded-xl border border-border-strong bg-card shadow-(--shadow-card) focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40">
        <div className="flex items-center gap-2 px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            ref={inputRef}
            id={`${baseId}-input`}
            type="text"
            role="combobox"
            aria-label={label}
            aria-expanded={expanded}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? optionId(active) : undefined}
            aria-describedby={`${baseId}-hint`}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveKey(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder={full ? `Up to ${max} courses at a time` : placeholder}
            disabled={full}
            maxLength={80}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            autoFocus={autoFocus}
            className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:h-11 sm:text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setActiveKey(null);
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <div role="group" aria-label="Filter by level" className="flex gap-1.5 overflow-x-auto border-t border-border px-3 py-2 [contain:inline-size] [scrollbar-width:none]">
          <FilterChip pressed={filter === null} onClick={() => { setFilter(null); setActiveKey(null); }}>All levels</FilterChip>
          {levelChips.map((level) => (
            <FilterChip key={level} pressed={filter === level} onClick={() => { setFilter(filter === level ? null : level); setActiveKey(null); }}>
              {levelLabel(level)}
            </FilterChip>
          ))}
        </div>

        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Course suggestions"
          aria-multiselectable="true"
          className={cn("max-h-[min(22rem,52vh)] overflow-y-auto overscroll-contain border-t border-border p-1.5 [contain:inline-size]", !expanded && "hidden")}
        >
          {sections.map((section, sectionIndex) => (
            <div key={section.id} role="group" aria-labelledby={`${baseId}-${section.id}`} className="pb-1">
              <div id={`${baseId}-${section.id}`} className="flex items-baseline justify-between gap-2 px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                <span>{section.label}</span>
                {section.note && <span className="truncate normal-case tracking-normal">{section.note}</span>}
              </div>
              {section.options.map((option, optionIndex) => {
                const i = offsets[sectionIndex] + optionIndex;
                const key = optionKey(option);
                const isSelected = selectedKeys.has(key);
                const isActive = i === active;
                if (option.kind === "custom") {
                  return (
                    <div
                      key={key}
                      id={optionId(i)}
                      data-index={i}
                      role="option"
                      aria-selected={isSelected}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => toggle(option)}
                      onMouseMove={() => setActiveKey(key)}
                      className={cn("flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm", isActive && "bg-muted")}
                    >
                      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong">
                        {isSelected ? <Check className="size-3.5" aria-hidden="true" /> : <Plus className="size-3.5" aria-hidden="true" />}
                      </span>
                      <span className="min-w-0">
                        Create <span className="font-medium">&ldquo;{option.title}&rdquo;</span> as a custom course
                      </span>
                    </div>
                  );
                }
                const { record, level, owned } = option;
                return (
                  <div
                    key={key}
                    id={optionId(i)}
                    data-index={i}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={owned || undefined}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => toggle(option)}
                    onMouseMove={() => !owned && setActiveKey(key)}
                    className={cn(
                      "flex min-h-11 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm",
                      owned ? "cursor-default opacity-60" : "cursor-pointer",
                      isActive && "bg-muted",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "inline-flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors duration-(--dur-press)",
                        isSelected ? "border-transparent bg-signal text-[oklch(0.2_0.02_70)]" : "border-border-strong text-muted-foreground",
                      )}
                    >
                      {isSelected || owned ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{record.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {optionMeta(record, level)}
                        {owned && " · Already in your courses"}
                      </span>
                    </span>
                    {record.kind === "template" && section.note !== "Generic templates" && (
                      <span className="hidden shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground sm:inline">Template</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {!expanded && !typed && (
          <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">Start typing a course name, subject, or code.</p>
        )}
      </div>

      {ownMatches.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {typed ? "Already in your courses: " : "Your recent courses: "}
          {ownMatches.map((course) => [course.name, course.code, course.institution].filter(Boolean).join(" · ")).join("; ")}
        </p>
      )}

      <p id={`${baseId}-hint`} className="sr-only">
        Type to search. Arrow keys move, Enter adds or removes the highlighted course, Backspace in an empty field removes the last one.
      </p>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

function FilterChip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "h-8 shrink-0 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors duration-(--dur-press)",
        pressed ? "border-foreground/80 bg-foreground text-background" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
