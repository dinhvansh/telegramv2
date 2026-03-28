FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY .prettierrc ./
COPY eslint.config.mjs ./
COPY src ./src
COPY test ./test

RUN npm run build

EXPOSE 4000

CMD ["sh", "-c", "npx prisma db push && node prisma/seed.js --if-empty && node dist/main"]
