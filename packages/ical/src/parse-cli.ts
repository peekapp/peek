import { parseCalendar } from "./parse";
// A separate process gives each calendar its floating-time zone and bounds parse
// work independently of the worker heartbeat. Never emit feed content to logs.
console.warn = () => {};
try {
  const input = await Bun.stdin.json();
  process.stdout.write(
    JSON.stringify(
      parseCalendar(input.body, input.id, input.config, input.now),
    ),
  );
} catch {
  process.exitCode = 1;
}
