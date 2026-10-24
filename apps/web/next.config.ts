import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: [
    "@peek/db",
    "@peek/extensions",
    "bun:sqlite",
    "drizzle-orm",
  ],
  async redirects() {
    return [
      {
        source: "/connection/:path*",
        destination: "/connections/:path*",
        permanent: true,
      },
    ];
  },
  transpilePackages: ["@peek/core"],
};
export default config;
