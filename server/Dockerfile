FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY src ./src
COPY tsconfig.json ./
EXPOSE 3000
# node itself (not npm) so Railway's stop signal reaches the server and open requests can finish.
CMD ["node", "--import", "tsx", "src/index.ts"]
