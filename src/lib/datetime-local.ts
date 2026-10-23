function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Formats a Date as <input type="datetime-local"> expects ("YYYY-MM-DDTHH:mm").
// Uses the browser's local time with no conversion, so it assumes the device
// timezone matches the profile timezone (see docs/PLANNING_ENGINE.md#limitations).
export function toDatetimeLocalValue(date: Date): string {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
