FROM oven/bun:1.4.2-debian AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/ical/package.json packages/ical/package.json
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.4.2-debian AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PEEK_DATABASE_PATH=/data/peek.sqlite
RUN mkdir -p /data && chown bun:bun /data
COPY --from=build --chown=bun:bun /app/package.json /app/bun.lock ./
COPY --from=build --chown=bun:bun /app/node_modules ./node_modules
COPY --from=build --chown=bun:bun /app/apps ./apps
COPY --from=build --chown=bun:bun /app/packages ./packages
COPY --from=build --chown=bun:bun /app/scripts ./scripts
USER bun
EXPOSE 3000
CMD ["bun", "run", "--cwd", "apps/web", "start:container"]
