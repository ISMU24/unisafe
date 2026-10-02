# UniSafe Server — Production Dockerfile
#
# Build context must be the UniSafe directory (the parent of this folder) so
# that the bundled policy PDFs can be included:
#
#   docker build -f server/Dockerfile -t unisafe-server .
#
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

# Build dependencies for better-sqlite3, which falls back to a local database
# file when no PostgreSQL connection is configured.
RUN apk add --no-cache python3 make g++ sqlite-libs

COPY server/package*.json ./

RUN npm ci --omit=dev && npm cache clean --force

COPY server/index.js ./index.js
COPY server/rag.js ./rag.js
COPY server/src/ ./src/
COPY assets/ ./assets/

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    mkdir -p data && chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "index.js"]