// Fixed snapshot for visual development. Not synchronized calendar data.
export type ScreenEvent = {
  id: string;
  title: string;
  owner: { name: string; color: "blue" | "pink" | "green" };
  due: string;
  remaining?: string;
};

export const demoScreen = {
  date: "Ср, 21 октября",
  time: "14:29",
  meeting: {
    title: "Обсуждение дизайна",
    owner: { name: "Тим", color: "blue" as const },
    time: "14:30 — 15:00",
    countdown: "00:48",
    location: "Google Meet",
  },
  events: [
    {
      id: "coursework",
      title: "Отправить курсовую",
      owner: { name: "Аня", color: "pink" },
      due: "Сегодня, 23:59",
      remaining: "9 ч 30 мин",
    },
    {
      id: "internet",
      title: "Оплатить интернет",
      owner: { name: "Общее", color: "green" },
      due: "Завтра",
    },
    {
      id: "design",
      title: "Передать макеты",
      owner: { name: "Тим", color: "blue" },
      due: "23 октября",
    },
  ] satisfies ScreenEvent[],
};
