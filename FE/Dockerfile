# ── Build stage ────────────────────────────────────────────────────────────
# VITE_* vars are baked into the bundle at build time, so they arrive as ARGs.
FROM node:22-alpine AS build
WORKDIR /app

ARG VITE_API_BASE_URL
ARG VITE_STORAGE_PUBLIC_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_STORAGE_PUBLIC_URL=$VITE_STORAGE_PUBLIC_URL

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Runtime stage (static nginx) ─────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
  CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1
CMD ["nginx", "-g", "daemon off;"]
