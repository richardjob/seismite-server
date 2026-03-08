# Stage 1: Build the Dashboard
FROM node:22-slim AS dashboard-build
WORKDIR /app
COPY dashboard/package*.json ./
RUN npm ci
COPY dashboard/ ./
RUN npm run build

# Stage 2: Final runtime image
FROM node:22-slim
WORKDIR /app

# Install openssl for Prisma
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Install backend dependencies
COPY package*.json ./
RUN npm ci

# Copy backend source
COPY server.ts mcp.ts ./
COPY prisma ./prisma

# Generate Prisma client
RUN npx prisma generate

# Copy the built dashboard from the previous stage
COPY --from=dashboard-build /app/dist ./dashboard/dist

# Set the port
ENV PORT=3000

# Expose the API port
EXPOSE 3000

# Run the server
CMD ["npx", "tsx", "server.ts"]
