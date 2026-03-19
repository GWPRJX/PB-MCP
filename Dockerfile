FROM node:22-alpine

WORKDIR /app

# Install server dependencies (tsx is in dependencies, not devDependencies)
COPY package*.json ./
RUN npm ci --omit=dev

# Install dashboard dependencies and build
COPY dashboard/package*.json ./dashboard/
RUN cd dashboard && npm ci
COPY dashboard/ ./dashboard/
RUN cd dashboard && npm run build

# Copy server source and config
COPY src/ ./src/
COPY tsconfig.json ./
COPY db/ ./db/

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "--import", "tsx/esm", "src/index.ts"]
