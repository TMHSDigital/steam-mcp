# Streamable HTTP build of steam-mcp. Live-mutation tools stay off unless
# STEAM_MCP_HTTP_ALLOW_WRITES=1 is set at run time.
#   docker build -t steam-mcp .
#   docker run -p 3000:3000 -e STEAM_API_KEY=... -e STEAM_MCP_ALLOWED_HOSTS=localhost steam-mcp

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --ignore-scripts
COPY src ./src
RUN npm run build

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
# 0.0.0.0 so the port mapping works. Set STEAM_MCP_ALLOWED_HOSTS to the
# hostname clients use; requests with any other Host header are refused.
CMD ["node", "dist/index.js", "--transport", "http", "--host", "0.0.0.0", "--port", "3000"]
