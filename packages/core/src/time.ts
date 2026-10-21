import { messages, type Locale } from "./i18n";
const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Moscow",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const months = {
  en: [
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
  ],
  ru: [
    "января",
    "февраля",
    "марта",
    "апреля",
    "мая",
    "июня",
    "июля",
    "августа",
    "сентября",
    "октября",
    "ноября",
    "декабря",
  ],
};
const weekdays = {
  en: [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ],
  ru: [
    "Воскресенье",
    "Понедельник",
    "Вторник",
    "Среда",
    "Четверг",
    "Пятница",
    "Суббота",
  ],
};
function parts(timestamp: number) {
  const p = Object.fromEntries(
    formatter.formatToParts(timestamp).map((p) => [p.type, p.value]),
  );
  const day = Number(p.day),
    month = Number(p.month),
    year = Number(p.year);
  const date = Date.UTC(year, month - 1, day);
  return {
    day,
    month,
    year,
    date,
    weekday: new Date(date).getUTCDay(),
    clock: `${p.hour}:${p.minute}`,
  };
}
export function formatTime(timestamp: number, locale: Locale = "en") {
  const p = parts(timestamp);
  return {
    clock: p.clock,
    date: `${weekdays[locale][p.weekday]}, ${p.day} ${months[locale][p.month - 1]}`,
    event: `${p.day} ${months[locale][p.month - 1]}, ${p.clock}`,
  };
}
export function relativeEventTime(
  timestamp: number,
  now: number,
  locale: Locale = "en",
) {
  const p = parts(timestamp),
    current = parts(now),
    t = messages(locale);
  const days = (p.date - current.date) / 86400000;
  if (days === 0) return p.clock;
  const label =
    days === 1
      ? t.tomorrow
      : days === -1
        ? t.yesterday
        : days > 1 && days < 7
          ? weekdays[locale][p.weekday]
          : `${p.day} ${months[locale][p.month - 1]}${p.year !== current.year ? ` ${p.year}` : ""}`;
  return `${label}, ${p.clock}`;
}
