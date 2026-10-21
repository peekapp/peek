import { defineScenario } from "@peekapp/sdk/scenario";
export default defineScenario({
  evaluate({ inputs, now }) {
    return {
      cards: inputs.messages.flatMap((s) =>
        (s.data as string[]).map((title, index) => ({
          id: `${s.connectionId}:${index}`,
          title,
          body: "Provided by a custom integration",
          targetAt: now + 60000,
          visibleFrom: now,
          expiresAt: now + 120000,
        })),
      ),
      nextRunAt: now + 60000,
    };
  },
});
