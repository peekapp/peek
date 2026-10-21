import type { Card } from "./cards";

const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

/** Fixture for explicit, one-time database seeding. Times are persisted unchanged. */
export function createDemoCards(now: number): Card[] {
  const meeting = now + 48_000;
  return [
    {
      id: "design-meeting",
      kind: "meeting",
      title: "Обсуждение дизайна",
      owner: { name: "Тим", color: "blue" },
      location: "Google Meet",
      targetAt: meeting,
      visibleFrom: meeting - 10 * minute,
      urgentAt: meeting - minute,
      expiresAt: meeting + 5 * minute,
      priority: 2,
      urgentPriority: 3,
    },
    ...[
      {
        id: "coursework",
        title: "Отправить курсовую",
        owner: { name: "Аня", color: "pink" } as const,
        offset: 9.5 * hour,
      },
      {
        id: "internet",
        title: "Оплатить интернет",
        owner: { name: "Общее", color: "green" } as const,
        offset: 30 * hour,
      },
      {
        id: "design",
        title: "Передать макеты",
        owner: { name: "Тим", color: "blue" } as const,
        offset: 2 * day,
      },
    ].map(({ offset, ...data }): Card => ({
      ...data,
      kind: "deadline",
      targetAt: now + offset,
      visibleFrom: now + offset - 7 * day,
      urgentAt: now + offset - day,
      expiresAt: now + offset + day,
      priority: 1,
      urgentPriority: 2,
    })),
  ];
}
