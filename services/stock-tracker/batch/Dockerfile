# Multi-stage build for Stock Tracker Batch Lambda
# Node.js 20 Alpine base for minimal image size

# Stage 1: Dependencies installation
FROM node:20-alpine AS deps

WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Stage 2: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install all dependencies (including dev dependencies)
RUN npm ci

# Copy shared libraries
COPY libs ./libs

# Build shared libraries in order (common → browser → ui)
RUN npm run build --workspace @nagiyu/common

# Copy stock-tracker core package
COPY services/stock-tracker/core ./services/stock-tracker/core

# Build core package
RUN npm run build --workspace @nagiyu/stock-tracker-core

# Copy batch source code
COPY services/stock-tracker/batch ./services/stock-tracker/batch

# Build batch package
RUN npm run build --workspace @nagiyu/stock-tracker-batch

# Stage 3: Runtime stage
FROM node:20-alpine AS runtime

WORKDIR /app

# Copy production dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy built shared libraries
COPY --from=builder /app/libs/common/dist ./libs/common/dist
COPY --from=builder /app/libs/common/package.json ./libs/common/

# Copy built core package
COPY --from=builder /app/services/stock-tracker/core/dist ./services/stock-tracker/core/dist
COPY --from=builder /app/services/stock-tracker/core/package.json ./services/stock-tracker/core/

# Copy built batch package
COPY --from=builder /app/services/stock-tracker/batch/dist ./services/stock-tracker/batch/dist
COPY --from=builder /app/services/stock-tracker/batch/package.json ./services/stock-tracker/batch/

# Copy root package.json for workspace resolution
COPY --from=builder /app/package.json ./

# Set environment to production
ENV NODE_ENV=production

# Lambda handler entry point
# Lambda will invoke the handler function from the specified module
# Format: <file>.<function> (e.g., minute.handler)
CMD ["node", "--experimental-specifier-resolution=node", "services/stock-tracker/batch/dist/src/minute.js"]
