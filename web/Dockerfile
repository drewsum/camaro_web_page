# Build stage: compile the Vite app to static files.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci
# Poly Haven textures, skies and models, fetched and shrunk once: this layer is
# cached until the manifest or the scripts change.
COPY src/scenes/common/polyHavenAssets.json ./src/scenes/common/
RUN node scripts/polyhaven.mjs
COPY . .
RUN npm run build

# Runtime stage: serve the static build with nginx.
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost/ >/dev/null || exit 1
