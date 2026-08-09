# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY apps/api ./apps/api
COPY apps/web/package.json ./apps/web/package.json
WORKDIR /app/apps/api
ENV NODE_ENV=production
RUN npx prisma generate
RUN npm run build

FROM base AS production
ENV NODE_ENV=production
ENV PORT=4000
WORKDIR /app

RUN addgroup -S nodejs && adduser -S nestjs -G nodejs

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# Production dependencies plus Prisma CLI (same version as @prisma/client) for migrate deploy.
RUN npm ci --omit=dev \
  && PRISMA_VERSION="$(node -p "require('./node_modules/@prisma/client/package.json').version")" \
  && npm install "prisma@${PRISMA_VERSION}" --no-save \
  && npm cache clean --force

COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma

WORKDIR /app/apps/api
RUN npx prisma generate

USER nestjs
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/src/main.js"]
