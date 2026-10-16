# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build stage: type-check, test-instrumented build, and bundle the client.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /build
COPY . .
RUN npm ci --no-audit --no-fund \
  && npm run build

# ---------------------------------------------------------------------------
# Runtime stage: production dependencies + built artifacts only.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Install production dependencies for the server workspace.
COPY --from=build /build/package.json /build/package-lock.json ./
COPY --from=build /build/packages/shared/package.json packages/shared/package.json
COPY --from=build /build/packages/server/package.json packages/server/package.json
RUN npm ci --omit=dev --workspace @heartland/shared --workspace @heartland/server --no-audit --no-fund

# Copy built artifacts.
COPY --from=build /build/packages/shared/dist packages/shared/dist
COPY --from=build /build/packages/server/dist packages/server/dist
COPY --from=build /build/packages/client/dist client/dist

ENV CLIENT_DIR=/app/client/dist
ENV HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "packages/server/dist/index.js"]
