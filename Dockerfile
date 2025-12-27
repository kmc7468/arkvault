# Base Image
FROM node:22-alpine AS base
WORKDIR /app

RUN npm install -g pnpm@10
COPY pnpm-lock.yaml .

# Build Stage
FROM base AS build
RUN pnpm fetch

COPY . .
RUN pnpm install --offline && \
    pnpm build && \
    sed -i "s/http\.createServer()/http.createServer({ requestTimeout: 0 })/g" ./build/index.js

# Deploy Stage
FROM base
RUN pnpm fetch --prod

COPY package.json .
RUN pnpm install --offline --prod

COPY --from=build /app/build ./build

EXPOSE 3000
ENV BODY_SIZE_LIMIT=Infinity
CMD ["node", "./build/index.js"]
