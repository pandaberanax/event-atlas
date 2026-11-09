FROM node:24-bookworm-slim

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    EVENT_ATLAS_DOCKER=1 \
    EVENT_ATLAS_REPORT_DIR=/data/reports \
    PORT=4318

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund \
    && npx playwright install --with-deps --only-shell chromium \
    && install -d -o node -g node /data/reports \
    && rm -rf /var/lib/apt/lists/*

COPY *.mjs ./
COPY manual/network-events.js manual/timeline-evidence.js ./manual/
COPY dist ./dist

USER node
EXPOSE 4318
CMD ["node", "server.mjs"]
