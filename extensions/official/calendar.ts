/** Public peek/calendar-events@1.0.0 dataset; ownership belongs to the host. */
export type CalendarEvent = {
  id: string;
  title: string;
  startAt: number;
  endAt?: number;
  deadlineAt?: number;
  allDay?: boolean;
  location?: string;
};
