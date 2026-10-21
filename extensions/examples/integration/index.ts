import { defineIntegration } from "@peekapp/sdk/integration";
export default defineIntegration({
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
