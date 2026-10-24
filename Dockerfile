FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY bin ./bin
COPY src ./src
EXPOSE 8788
CMD ["node", "bin/free-web-mcp.js", "serve", "--port", "8788"]
