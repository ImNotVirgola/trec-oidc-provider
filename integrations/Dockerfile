FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3 python3 build-essential && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev && npm cache clean --force
COPY run.cjs holder.cjs ./
COPY runtime/ runtime/
COPY config/testnet.json config/testnet.json
COPY server/ server/
COPY local-client/ local-client/
COPY views/ views/
COPY public/ public/
USER node
CMD ["node", "run.cjs", "server"]
