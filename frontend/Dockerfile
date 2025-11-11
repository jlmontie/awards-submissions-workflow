FROM node:18-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build arguments for Next.js public env vars
# These are embedded into the client bundle at build time
ARG NEXT_PUBLIC_RECAPTCHA_SITE_KEY
ARG NEXT_PUBLIC_GCS_BUCKET
ARG GCP_PROJECT_ID
ARG PUBLIC_ASSETS_BUCKET

# Set as environment variables for the build
ENV NEXT_PUBLIC_RECAPTCHA_SITE_KEY=$NEXT_PUBLIC_RECAPTCHA_SITE_KEY
ENV NEXT_PUBLIC_GCS_BUCKET=$NEXT_PUBLIC_GCS_BUCKET
ENV GCP_PROJECT_ID=$GCP_PROJECT_ID
ENV PUBLIC_ASSETS_BUCKET=$PUBLIC_ASSETS_BUCKET

# Build Next.js application
ENV NEXT_TELEMETRY_DISABLED 1
RUN node test-env.js || echo "test-env.js not found"
RUN npm run build
RUN echo "Checking built config..." && cat .next/server/app/config/env.js || echo "Config not found"

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]

