# Build context: repository root.
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/prisma.config.ts apps/api/
COPY apps/api/prisma apps/api/prisma
# Installs api deps only; the api workspace postinstall runs `prisma generate`.
RUN npm ci -w apps/api --include=dev --no-audit --no-fund

COPY tsconfig.base.json ./
COPY apps/api/tsconfig.json apps/api/
COPY apps/api/src apps/api/src

WORKDIR /app/apps/api
EXPOSE 3001
USER node
# Apply pending migrations, then start. Safe to repeat on every container start.
CMD ["sh", "-c", "npx prisma migrate deploy && exec npx tsx src/server.ts"]
