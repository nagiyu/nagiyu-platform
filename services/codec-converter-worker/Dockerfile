# FFmpeg base image with H.264, VP9, and AV1 codec support
# Using Alpine-based image for smaller size
FROM jrottenberg/ffmpeg:6.1-alpine

# Install Python and pip
RUN apk add --no-cache \
    python3 \
    py3-pip \
    ca-certificates

# Create a non-root user for running the worker
RUN adduser -D -u 1001 worker

# Set working directory
WORKDIR /app

# Copy requirements file and install Python dependencies
COPY requirements.txt .
RUN python3 -m venv /app/venv && \
    /app/venv/bin/pip install --no-cache-dir -r requirements.txt

# Copy the entrypoint script
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

# Switch to non-root user
USER worker

# Set the entrypoint
ENTRYPOINT ["/app/entrypoint.sh"]
