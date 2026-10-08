# Stage 1: Build the Vite app
FROM node:22-alpine AS builder
WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# The UI imports the shared registries from backend/common/languages.json
# and backend/common/fonts.json via relative paths that escape frontend/
# (see vite.config.ts server.fs.allow). The named build context supplies
# each at the exact path the relative imports resolve to from /app/src/**:
# /backend/common/<name>.json.
COPY --from=backend common/languages.json /backend/common/languages.json
COPY --from=backend common/fonts.json /backend/common/fonts.json

# Public build metadata only: ARG values land in image history and public CI logs;
# secrets never become ARGs - runtime env only.
ARG VITE_APP_VERSION=dev
ENV VITE_APP_VERSION=${VITE_APP_VERSION}

# Build production bundle
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine

# Copy the built Vite app
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Deploy-time configuration: nginx's stock docker-entrypoint.sh runs
# executable *.sh hooks in /docker-entrypoint.d/ before starting nginx.
# The hook writes config.js from the API_URL/DEMO_MODE env vars, so a
# self-hoster points the SPA at their own API without rebuilding the image.
COPY docker-entrypoint.d/30-app-config.sh /docker-entrypoint.d/30-app-config.sh
# The stock entrypoint skips non-executable .sh files; chmod here because
# the git exec bit is not guaranteed to survive every checkout.
RUN chmod +x /docker-entrypoint.d/30-app-config.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
