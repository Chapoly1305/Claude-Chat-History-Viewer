FROM node:20-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy application files
COPY . .

# Create volume mount point for Claude projects
RUN mkdir -p /claude-projects

# Set environment variable for Claude projects path
ENV CLAUDE_PROJECTS_PATH=/claude-projects

# Expose the application port
EXPOSE 3101

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3101/ || exit 1

# Run as non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    chown -R nodejs:nodejs /app
USER nodejs

CMD ["node", "server.js"]
