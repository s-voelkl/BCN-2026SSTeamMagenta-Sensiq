# From: https://docs.docker.com/guides/reactjs/containerize/
# =========================================
# Stage 1: Build the React.js Application
# =========================================

# Use a lightweight Node.js image for building (customizable via ARG)
FROM node:lts-alpine AS builder

# Set the working directory inside the container
WORKDIR /app

# Copy package-related files first to leverage Docker's caching mechanism
COPY package.json yarn.lock* ./

# Install project dependencies using yarn (ensures a clean, reproducible install)
RUN --mount=type=cache,target=/root/.yarn YARN_CACHE_FOLDER=/root/.yarn yarn install --frozen-lockfile

# Copy the rest of the application source code into the container
COPY . .

# Build the application (outputs to /app/dist)
RUN yarn build

# =========================================
# Stage 2: Prepare Nginx to Serve Static Files
# =========================================

FROM nginx:alpine AS runner

# Copy custom Nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Copy the static build output from the build stage to Nginx's default HTML serving directory
COPY --chown=nginx:nginx --from=builder /app/dist /usr/share/nginx/html

# Ensure Nginx run directories are writable by the nginx user
RUN chown -R nginx:nginx /var/cache/nginx /var/run /var/log/nginx

# Use a non-root user for security best practices
USER nginx

# Expose port 8080 to allow HTTP traffic
# Note: The default NGINX container now listens on port 8080 instead of 80 
EXPOSE 8080

# Start Nginx directly with custom config
ENTRYPOINT ["nginx", "-c", "/etc/nginx/nginx.conf"]
CMD ["-g", "daemon off;"]