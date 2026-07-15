# proto-forge MCP server — командный хостинг (Streamable HTTP)
FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
COPY knowledge ./knowledge
COPY template ./template
COPY template-static ./template-static
COPY blocks ./blocks
COPY brand ./brand
RUN npm run build

ENV PROTO_HTTP_PORT=8811
EXPOSE 8811

CMD ["node", "dist/server.js"]
