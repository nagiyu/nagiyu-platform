#!/bin/bash
# Dockerfile structure validation script
# This script validates the Dockerfile without actually building it

set -e

echo "=== Dockerfile Structure Validation ==="
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check required files exist
echo "✓ Checking required files..."
required_files=("Dockerfile" "entrypoint.sh" "README.md" ".dockerignore")
for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✓ $file exists"
    else
        echo "  ✗ $file is missing!"
        exit 1
    fi
done
echo ""

# Validate entrypoint.sh is executable-ready (has shebang)
echo "✓ Checking entrypoint.sh..."
if head -n 1 entrypoint.sh | grep -q "^#!/bin/bash"; then
    echo "  ✓ entrypoint.sh has correct shebang"
else
    echo "  ✗ entrypoint.sh missing shebang!"
    exit 1
fi

# Check for required environment variables in entrypoint
required_vars=("JOB_ID" "OUTPUT_CODEC" "S3_BUCKET" "DYNAMODB_TABLE" "AWS_REGION")
echo "  ✓ Checking required environment variables..."
for var in "${required_vars[@]}"; do
    # Check for both ${VAR} and $VAR patterns
    if grep -qE "\\\$\{${var}\}|\\\$${var}[^A-Za-z_]" entrypoint.sh; then
        echo "    ✓ ${var} is used"
    else
        echo "    ✗ ${var} is not found!"
        exit 1
    fi
done
echo ""

# Validate Dockerfile syntax (basic check)
echo "✓ Checking Dockerfile..."
if grep -q "^FROM jrottenberg/ffmpeg:6.1-alpine" Dockerfile; then
    echo "  ✓ Using jrottenberg/ffmpeg:6.1-alpine base image"
else
    echo "  ✗ Base image not found or incorrect!"
    exit 1
fi

if grep -q "ENTRYPOINT.*entrypoint.sh" Dockerfile; then
    echo "  ✓ Entrypoint is configured"
else
    echo "  ✗ Entrypoint not configured!"
    exit 1
fi

if grep -q "USER worker" Dockerfile; then
    echo "  ✓ Non-root user configured"
else
    echo "  ✗ Running as root (security issue)!"
    exit 1
fi
echo ""

# Check for security best practices
echo "✓ Checking security practices..."
if grep -q "adduser.*worker" Dockerfile; then
    echo "  ✓ Custom user 'worker' created"
else
    echo "  ✗ No custom user created!"
    exit 1
fi

if grep -q "chmod +x.*entrypoint.sh" Dockerfile; then
    echo "  ✓ Entrypoint script is made executable"
else
    echo "  ! Warning: entrypoint.sh might not be executable in container"
fi
echo ""

# Check supported codecs in entrypoint
echo "✓ Checking codec support in entrypoint..."
codecs=("h264" "vp9" "av1")
for codec in "${codecs[@]}"; do
    if grep -q "^[[:space:]]*${codec})" entrypoint.sh; then
        echo "  ✓ ${codec} codec supported"
    else
        echo "  ✗ ${codec} codec not found!"
        exit 1
    fi
done
echo ""

echo "==================================="
echo "✓ All structure validations passed!"
echo "==================================="
echo ""
echo "Note: This script only validates structure."
echo "To build the Docker image, run:"
echo "  docker build -t codec-converter-worker:latest ."
echo ""
echo "The actual build requires internet access to:"
echo "  - Pull jrottenberg/ffmpeg:6.1-alpine"
echo "  - Install Alpine packages (python3, bash, etc.)"
echo "  - Install AWS CLI via pip"
