FROM node:22-bookworm-slim AS dependencies

ENV METEOR_ALLOW_SUPERUSER=1 \
    PUPPETEER_SKIP_DOWNLOAD=true \
    CI=true

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git python3 python3-pip python3-venv build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY .meteor/release .meteor/release
RUN curl -fsSL "https://install.meteor.com?release=$(sed 's/.*@//' .meteor/release)" -o /tmp/install-meteor.sh \
    && sh /tmp/install-meteor.sh
RUN find /root/.meteor -path '*/dev_bundle/bin/node' -type f -exec ln -sf /usr/local/bin/node {} \;

COPY package.json package-lock.json tsconfig.json ./
COPY eslint ./eslint
COPY patches ./patches
COPY deploy/prepare-excalidraw-assets.mjs ./deploy/prepare-excalidraw-assets.mjs
RUN meteor npm ci

FROM dependencies AS build
COPY . .
# Keep Meteor 3.3.2, but use the patched Node 22 runtime for the build tool.
# The bundled Node 22.18.0 is older than the production runtime.
RUN find /root/.meteor -path '*/dev_bundle/bin/node' -type f -exec ln -sf /usr/local/bin/node {} \;
# Preserve WebAssembly for source maps. Local builds can skip minification.
ARG METEOR_BUILD_FLAGS=""
RUN TOOL_NODE_FLAGS=--no-opt meteor build $METEOR_BUILD_FLAGS --directory /built
WORKDIR /built/bundle/programs/server
RUN meteor npm install --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3000 HTTP_FORWARDED_COUNT=1 CLUSTER_WORKERS_COUNT=0 TZ=Asia/Shanghai
WORKDIR /app
COPY --from=build --chown=node:node /built/bundle ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "main.js"]
