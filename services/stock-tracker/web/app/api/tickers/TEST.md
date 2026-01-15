# Tickers API - Testing Guide

## Overview

This document provides testing guidance for the Tickers API endpoint implemented in Task 1.6.

## API Endpoint

```
GET /api/tickers
```

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| exchangeId | string | No | - | Filter tickers by exchange ID |
| limit | number | No | 50 | Number of results (1-100) |
| lastKey | string | No | - | Pagination key from previous response |

### Required Permission

- `stocks:read`

## Testing Locally

### Prerequisites

1. Build the core package:
   ```bash
   cd services/stock-tracker/core
   npm run build
   ```

2. Start the development server:
   ```bash
   cd services/stock-tracker/web
   SKIP_AUTH_CHECK=true DYNAMODB_TABLE=test-table npm run dev
   ```

### Test Cases

#### 1. Basic Request
```bash
curl http://localhost:3000/api/tickers
```

**Expected**: 500 error (no DynamoDB) but routing and auth work

#### 2. With Limit Parameter
```bash
curl "http://localhost:3000/api/tickers?limit=10"
```

**Expected**: Same as above, validates limit parameter

#### 3. Invalid Limit (>100)
```bash
curl "http://localhost:3000/api/tickers?limit=150"
```

**Expected**: 
```json
{
  "error": "INVALID_REQUEST",
  "message": "limit は 1 から 100 の間で指定してください"
}
```

#### 4. With Exchange Filter
```bash
curl "http://localhost:3000/api/tickers?exchangeId=NASDAQ"
```

**Expected**: 500 error (no DynamoDB) but query param is parsed

#### 5. Health Check (Sanity Test)
```bash
curl http://localhost:3000/api/health
```

**Expected**:
```json
{
  "status": "ok",
  "timestamp": "2026-01-15T06:42:36.830Z",
  "version": "1.0.0"
}
```

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SKIP_AUTH_CHECK` | Skip authentication for testing | `true` |
| `DYNAMODB_TABLE` | DynamoDB table name | `nagiyu-stock-tracker-main-dev` |
| `AWS_REGION` | AWS region | `us-east-1` |
| `TEST_USER_ROLES` | Mock user roles (comma-separated) | `stock-user,stock-admin` |

## Response Format

### Success Response (200 OK)

```json
{
  "tickers": [
    {
      "tickerId": "NSDQ:AAPL",
      "symbol": "AAPL",
      "name": "Apple Inc.",
      "exchangeId": "NASDAQ"
    }
  ],
  "pagination": {
    "count": 1,
    "lastKey": "NSDQ:AAPL"
  }
}
```

### Error Responses

#### 401 Unauthorized
```json
{
  "error": "UNAUTHORIZED",
  "message": "認証が必要です"
}
```

#### 403 Forbidden
```json
{
  "error": "FORBIDDEN",
  "message": "この操作を実行する権限がありません"
}
```

#### 400 Bad Request
```json
{
  "error": "INVALID_REQUEST",
  "message": "limit は 1 から 100 の間で指定してください"
}
```

#### 500 Internal Server Error
```json
{
  "error": "INTERNAL_ERROR",
  "message": "ティッカー一覧の取得に失敗しました"
}
```

## Integration Testing (Future)

Once DynamoDB is set up:

1. Create test data in DynamoDB
2. Test with actual exchange IDs
3. Test pagination with large datasets
4. Test authentication with real NextAuth.js sessions

## Notes

- **Phase 1**: Uses mock authentication when `SKIP_AUTH_CHECK=true`
- **Phase 2**: Will integrate with NextAuth.js for real authentication
- **Pagination**: Currently uses in-memory pagination; will be optimized for DynamoDB in Phase 2
