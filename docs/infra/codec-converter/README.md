# Codec Converter Infrastructure

AWS CDK project for Codec Converter infrastructure.

## Overview

This CDK project provisions the following AWS resources:

- **S3 Bucket**: Storage for input/output video files
  - Bucket name: `nagiyu-codec-converter-storage-{env}`
  - SSE-S3 encryption enabled
  - 24-hour lifecycle policy for automatic deletion
  - CORS configuration for browser uploads
  - Private access (Presigned URL only)

- **DynamoDB Table**: Job management
  - Table name: `nagiyu-codec-converter-jobs-{env}`
  - Partition key: `jobId` (String)
  - TTL enabled on `expiresAt` attribute
  - On-demand billing mode

## Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js >= 22.0.0
- npm >= 10.0.0

## Usage

### Install dependencies

```bash
npm install
```

### Build the project

```bash
npm run build
```

### Synthesize CloudFormation template

```bash
npx cdk synth
```

### Deploy to dev environment

```bash
npx cdk deploy --context env=dev
```

### Deploy to prod environment

```bash
npx cdk deploy --context env=prod
```

### Deploy with custom CORS origin

```bash
npx cdk deploy --context env=dev --context allowedOrigin=https://your-custom-domain.com
```

### Destroy stack

```bash
npx cdk destroy --context env=dev
```

## Configuration

The stack accepts the following context parameters:

- `env`: Environment name (default: `dev`)
  - Used for resource naming: `nagiyu-codec-converter-{resource}-{env}`
- `allowedOrigin`: CORS allowed origin (default: `https://codec-converter.nagiyu.com`)
  - Configure the origin allowed to make cross-origin requests to S3

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template

## Architecture

See [Architecture Documentation](../../services/codec-converter/architecture.md) for detailed information about the overall system architecture.

## CDK Project Location

The CDK TypeScript code is located in `/infra/codec-converter/`.
