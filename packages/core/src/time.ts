import { messages, type Locale } from "./i18n";
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(timeZone: string) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    if (formatters.size >= 32) formatters.clear();
    formatters.set(timeZone, formatter);
  }
  return formatter;
}
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
function parts(timestamp: number, timeZone: string) {
  const p = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(timestamp)
      .map((p) => [p.type, p.value]),
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
export function formatTime(
  timestamp: number,
  locale: Locale = "en",
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  const p = parts(timestamp, timeZone);
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
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  const p = parts(timestamp, timeZone),
    current = parts(now, timeZone),
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

export function relativeUpdateTime(timestamp: number | null, now: number, locale: Locale) {
  const t = messages(locale);
  if (timestamp === null) return t.notUpdatedYet;
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60000));
  if (minutes === 0) return t.justNow;
  if (minutes < 60) return t.minutesAgo.replace("{count}", String(minutes));
  if (minutes < 1440) return t.hoursAgo.replace("{count}", String(Math.floor(minutes / 60)));
  return t.daysAgo.replace("{count}", String(Math.floor(minutes / 1440)));
}
