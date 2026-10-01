# ── Build stage ────────────────────────────────────────────────────────────
# VITE_* vars are baked into the bundle at build time, so they arrive as ARGs.
FROM node:22-alpine AS build
WORKDIR /app

ARG VITE_API_BASE_URL
ARG VITE_STORAGE_PUBLIC_URL
ARG VITE_GTM_ID
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_STORAGE_PUBLIC_URL=$VITE_STORAGE_PUBLIC_URL
ENV VITE_GTM_ID=$VITE_GTM_ID

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
# The inline scripts' text depends on build-time env (VITE_GTM_ID), so their CSP hashes are
# computed from the built HTML.
RUN node scripts/render-nginx-csp.mjs dist nginx-security-headers.conf /app/security-headers.conf

# ── Runtime stage (static nginx) ─────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --retries=5 \
  CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1
CMD ["nginx", "-g", "daemon off;"]
