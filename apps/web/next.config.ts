import type { NextConfig } from 'next';
const config: NextConfig = {
  serverExternalPackages: ['@peek/db', 'bun:sqlite', 'drizzle-orm'],
  transpilePackages: ['@peek/core'],
};
export default config;
