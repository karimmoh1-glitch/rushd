// Formats a Date as the value <input type="datetime-local"> expects
// ("YYYY-MM-DDTHH:mm"), in the browser's local time — there is no timezone
// conversion here, which relies on the student's device timezone matching
// their profile timezone. See docs/PLANNING_ENGINE.md#limitations.
export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
