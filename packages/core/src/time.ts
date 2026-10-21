const dateParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Moscow",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Construct English labels explicitly: ICU punctuation and capitalization differ
// between Bun and browsers, which must render identical hydration text.
export function formatTime(timestamp: number) {
  const parts = Object.fromEntries(
    dateParts.formatToParts(timestamp).map((part) => [part.type, part.value]),
  );
  const year = Number(parts.year),
    month = Number(parts.month),
    day = Number(parts.day);
  const clock = `${parts.hour}:${parts.minute}`;
  const weekday =
    weekdays[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return {
    clock,
    date: `${weekday}, ${day} ${months[month - 1]}`,
    event: `${day} ${months[month - 1].slice(0, 3)}, ${clock}`,
  };
}
