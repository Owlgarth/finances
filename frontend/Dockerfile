# Stage 1: Build the Vite app
FROM node:22-alpine AS builder
WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Build args baked into the frontend bundle at build time
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

ARG VITE_DEMO_MODE
ENV VITE_DEMO_MODE=${VITE_DEMO_MODE}

# Build production bundle
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine

# Copy the built Vite app
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
