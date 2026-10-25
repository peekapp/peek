import type { Contract, Schema } from "../index.js";

/** An expanded occurrence; IDs are stable within one configured connection. */
export type Event = {
  id: string;
  title: string;
  location?: string;
} & (
  | { kind: "timed"; startAt: number; endAt?: number }
  | { kind: "all-day"; startDate: string; endDate?: string; timeZone: string }
);
/** Complete replacement over [from, to), Unix milliseconds, including ongoing events. */
export type Events = { from: number; to: number; events: Event[] };
const timestamp: Schema = {
  type: "integer",
  minimum: -8640000000000000,
  maximum: 8640000000000000,
};
const date: Schema = { type: "string", format: "date" };
const common: Record<string, Schema> = {
  id: { type: "string", minLength: 1, maxLength: 2200 },
  title: { type: "string", minLength: 1, maxLength: 1000 },
  location: { type: "string", maxLength: 1000 },
};
/** Copy this JSON definition into provides or contracts; it contains no executable code. */
export const eventsContract: Contract = {
  id: "peek/events",
  version: "1.0.0",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["from", "to", "events"],
    properties: {
      from: timestamp,
      to: timestamp,
      events: {
        type: "array",
        maxItems: 10000,
        items: {
          oneOf: [
            {
              type: "object",
              additionalProperties: false,
              required: ["id", "title", "kind", "startAt"],
              properties: {
                ...common,
                kind: { enum: ["timed"] },
                startAt: timestamp,
                endAt: timestamp,
              },
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["id", "title", "kind", "startDate", "timeZone"],
              properties: {
                ...common,
                kind: { enum: ["all-day"] },
                startDate: date,
                endDate: date,
                timeZone: {
                  type: "string",
                  format: "time-zone",
                  maxLength: 100,
                },
              },
            },
          ],
        },
      },
    },
  },
};
