# UniSafe Dashboard - Production Dockerfile
#
# The dashboard is a static SPA. Vite inlines VITE_* values at BUILD time, so
# the API origin must be passed as a build argument, not a runtime environment
# variable:
#
#   docker build --build-arg VITE_API_URL=https://unisafe-api.onrender.com .
#
# Leave VITE_API_URL unset to serve the API from the same origin instead (the
# included nginx.conf proxies /api/ and /socket.io/ to a backend named "server",
# which is how docker-compose.yml runs it).
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

# Production stage with nginx
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]