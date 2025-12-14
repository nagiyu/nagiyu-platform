# Multi-stage build for codec-converter worker
# Use jrottenberg/ffmpeg as the base - it's well-maintained and includes all required codecs
# (H.264/libx264, VP9/libvpx-vp9, AV1/libaom-av1)
FROM jrottenberg/ffmpeg:6.1-alpine

# Install runtime dependencies
# - python3 and pip for AWS CLI (S3 and DynamoDB operations)
# - ca-certificates for SSL/TLS connections to AWS
# - bash for entrypoint script
RUN apk add --no-cache \
    python3 \
    py3-pip \
    ca-certificates \
    bash \
    && pip3 install --no-cache-dir --break-system-packages awscli

# Verify FFmpeg installation and required codecs
RUN ffmpeg -version && \
    ffmpeg -codecs 2>&1 | grep -E "libx264|libvpx-vp9|libaom" || echo "Warning: Verifying codecs..."

# Create non-root user for security
RUN addgroup -g 1001 worker && \
    adduser -D -u 1001 -G worker worker

# Set working directory
WORKDIR /app

# Copy worker source code
COPY --chown=worker:worker entrypoint.sh .

# Make entrypoint script executable
RUN chmod +x /app/entrypoint.sh

# Switch to non-root user
USER worker

# Set entrypoint
ENTRYPOINT ["/app/entrypoint.sh"]
