FROM node:22-bookworm-slim

WORKDIR /app/apps/web

COPY apps/web/package*.json ./
RUN npm ci

COPY apps/web/tsconfig.json ./
COPY apps/web/next.config.ts ./
COPY apps/web/postcss.config.mjs ./
COPY apps/web/eslint.config.mjs ./
COPY apps/web/public ./public
COPY apps/web/src ./src
COPY stitch /app/stitch

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0", "--port", "3000"]
