export type Owner = { name: string; color: "blue" | "pink" | "green" };

/** UTC milliseconds. Visibility is [visibleFrom, expiresAt). */
export type Card = {
  id: string;
  kind: "meeting" | "deadline";
  title: string;
  owner: Owner;
  targetAt: number;
  visibleFrom: number;
  expiresAt: number;
  urgentAt: number;
  priority: number;
  urgentPriority: number;
  location?: string;
};

export function priorityAt(card: Card, now: number): number {
  return now >= card.urgentAt ? card.urgentPriority : card.priority;
}

export function activeCards(cards: readonly Card[], now: number): Card[] {
  return cards
    .filter((card) => card.visibleFrom <= now && now < card.expiresAt)
    .sort(
      (a, b) =>
        priorityAt(b, now) - priorityAt(a, now) ||
        a.targetAt - b.targetAt ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

export function countdown(
  card: Card,
  now: number,
): { label: string; value: string } {
  const remaining = card.targetAt - now;
  if (remaining <= 0) {
    return card.kind === "meeting"
      ? { label: "Meeting", value: "Started" }
      : { label: "Deadline", value: "Overdue" };
  }
  if (card.kind === "meeting") {
    const seconds = Math.ceil(remaining / 1000);
    const minutes = Math.floor(seconds / 60);
    return {
      label: "Starts in",
      value: `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`,
    };
  }
  const minutes = Math.ceil(remaining / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  return {
    label: "Due in",
    value:
      days > 0
        ? `${days}d ${hours}h`
        : hours > 0
          ? `${hours}h ${rest}m`
          : `${rest}m`,
  };
}
