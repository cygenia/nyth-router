FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=7860
COPY --from=build /app/package*.json ./
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/web/package.json ./web/package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server ./server
COPY --from=build /app/web/dist ./web/dist
EXPOSE 7860
CMD ["npm", "run", "start", "-w", "server"]
