FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production PORT=4100
EXPOSE 4100
CMD ["node", "src/server.js"]
