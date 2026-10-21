import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: [
    "@peek/db",
    "@peek/extensions",
    "bun:sqlite",
    "drizzle-orm",
  ],
  transpilePackages: ["@peek/core"],
};
export default config;
