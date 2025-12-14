# FFmpeg-based worker for codec conversion
# Multi-stage build for minimal image size
FROM jrottenberg/ffmpeg:6.1-alpine

# Install Python runtime and dependencies
# Note: Using fixed package versions where possible for reproducibility
# Install Python, bash, and other required runtime dependencies
# We install everything in one RUN command to minimize layers
RUN apk add --no-cache \
    python3 \
    py3-pip \
    bash \
    curl \
    && python3 -m venv /opt/venv \
    && . /opt/venv/bin/activate \
    && pip install --no-cache-dir \
        boto3==1.35.76 \
        botocore==1.35.76

# Set up Python virtual environment in PATH
ENV PATH="/opt/venv/bin:$PATH"

# Create non-root user for security
RUN adduser -D -u 1001 worker

# Set working directory
WORKDIR /app

# Copy entrypoint script
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Switch to non-root user
USER worker

# Set entrypoint
ENTRYPOINT ["/app/entrypoint.sh"]
