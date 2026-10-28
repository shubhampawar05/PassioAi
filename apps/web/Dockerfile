# Build context: repository root.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
RUN npm ci -w apps/web --include-workspace-root --include=dev --no-audit --no-fund
COPY tsconfig.base.json ./
COPY apps/web apps/web
RUN npm run build -w apps/web

FROM nginx:1.27-alpine
COPY apps/web/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
