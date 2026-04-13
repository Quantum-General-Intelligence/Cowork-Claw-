FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_ vars must be present at build time for Next.js to inline them
# into the client bundle. Docker Compose passes these via build.args.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
ARG NEXT_PUBLIC_AUTH_PROVIDERS
ARG NEXT_PUBLIC_GITHUB_CLIENT_ID

RUN pnpm build

# Runner stage — slim, production-only.
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Next.js standalone output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# db-migrate needs the scripts dir, drizzle config, schema, and full node_modules.
# Copy them alongside the standalone output; they add ~200MB but simplify the compose story.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/lib/db ./lib/db
COPY --from=builder --chown=nextjs:nodejs /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
