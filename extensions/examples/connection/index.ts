import { defineConnection } from "@peekapp/sdk/connection";
export default defineConnection({
  run({ settings, now }) {
    return {
      datasets: {
        messages: [
          String((settings as { message?: string }).message ?? "Hello"),
        ],
      },
      nextRunAt: now + 60000,
    };
  },
});
