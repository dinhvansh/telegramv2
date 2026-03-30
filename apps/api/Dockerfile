FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY apps/api/package*.json ./
RUN npm ci

COPY apps/api/prisma ./prisma
RUN npx prisma generate

COPY apps/api/tsconfig*.json ./
COPY apps/api/nest-cli.json ./
COPY apps/api/.prettierrc ./
COPY apps/api/eslint.config.mjs ./
COPY apps/api/src ./src
COPY apps/api/test ./test

RUN npm run build

EXPOSE 4000

CMD ["sh", "-c", "npx prisma db push && node prisma/seed.js --if-empty && node dist/main"]
