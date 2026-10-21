FROM node:24.14.0-bookworm-slim
WORKDIR /runner
COPY bootstrap.mjs /runner/bootstrap.mjs
USER node
ENTRYPOINT ["node", "/runner/bootstrap.mjs"]
