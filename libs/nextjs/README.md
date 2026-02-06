# @nagiyu/nextjs

Next.js-specific API Route helpers for Nagiyu Platform.

## Overview

This package provides reusable helpers for Next.js API Routes, including:

- **Authentication**: Session management and authorization checks
- **Repository**: DynamoDB repository initialization
- **Pagination**: Query parameter parsing and response creation
- **Error Handling**: Consistent error response formatting

## Installation

This package is part of the Nagiyu Platform monorepo and is not published to npm.

```bash
npm install @nagiyu/nextjs
```

## Dependencies

- `@nagiyu/common`: Platform common utilities
- `next`: ^16.0.0 (peer dependency)
- `next-auth`: ^4.24.0 (peer dependency)

## Usage

### Authentication

```typescript
import { withAuth } from '@nagiyu/nextjs';
import { NextRequest } from 'next/server';

// Wrap your handler with authentication
export const GET = withAuth('stocks:read', async (session, request: NextRequest) => {
  // Session is guaranteed to exist and have the required permission
  const userId = session.user.userId;
  return NextResponse.json({ userId });
});
```

### Repository

```typescript
import { withRepository } from '@nagiyu/nextjs';
import { HoldingRepository } from '../core';
import { getDynamoDBClient, getTableName } from '../lib/dynamodb';

export const GET = withRepository(
  getDynamoDBClient,
  getTableName,
  HoldingRepository,
  async (repo, request) => {
    const holdings = await repo.list();
    return NextResponse.json({ holdings });
  }
);
```

### Pagination

```typescript
import { parsePagination, createPaginatedResponse } from '@nagiyu/nextjs';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  // Parse query parameters
  const { limit, lastKey } = parsePagination(request);

  // Fetch data
  const result = await repository.list({ limit, cursor: lastKey });

  // Return paginated response
  return createPaginatedResponse(result.items, result.nextCursor);
}
```

### Error Handling

```typescript
import { handleApiError } from '@nagiyu/nextjs';

export async function GET() {
  try {
    const data = await repository.getById('123');
    return NextResponse.json(data);
  } catch (error) {
    // Automatically maps errors to appropriate HTTP status codes
    return handleApiError(error);
  }
}
```

## API Reference

### Authentication

#### `getAuthError(session, permission)`

Checks if a session has the required permission.

- **Parameters**:
  - `session: Session | null` - User session
  - `permission: Permission` - Required permission
- **Returns**: `AuthError | null` - Error information or null if authorized

#### `getSessionOrThrow()`

Gets the current session or throws an error.

- **Returns**: `Promise<Session>` - Current session
- **Throws**: Error if not authenticated

#### `getOptionalSession()`

Gets the current session or null.

- **Returns**: `Promise<Session | null>` - Current session or null

#### `withAuth(permission, handler)`

Higher-order function that wraps a handler with authentication.

- **Parameters**:
  - `permission: Permission` - Required permission
  - `handler: (session, ...args) => Promise<NextResponse>` - Handler function
- **Returns**: Wrapped handler function

### Repository

#### `withRepository(getDynamoDBClient, getTableName, Repository, handler)`

Higher-order function that initializes a repository.

- **Parameters**:
  - `getDynamoDBClient: GetDynamoDBClient` - Function to get DynamoDB client
  - `getTableName: GetTableName` - Function to get table name
  - `Repository: RepositoryConstructor<T>` - Repository class
  - `handler: (repo, ...args) => Promise<NextResponse>` - Handler function
- **Returns**: Wrapped handler function

#### `withRepositories(getDynamoDBClient, getTableName, repositories, handler)`

Higher-order function that initializes multiple repositories.

- **Parameters**:
  - `getDynamoDBClient: GetDynamoDBClient` - Function to get DynamoDB client
  - `getTableName: GetTableName` - Function to get table name
  - `repositories: RepositoryConstructor[]` - Array of repository classes
  - `handler: (repos, ...args) => Promise<NextResponse>` - Handler function
- **Returns**: Wrapped handler function

### Pagination

#### `parsePagination(request)`

Parses pagination parameters from request.

- **Parameters**:
  - `request: NextRequest` - Next.js request object
- **Returns**: `PaginationParams` - Parsed pagination parameters
- **Throws**: Error if limit is invalid (< 1 or > 100)

#### `createPaginatedResponse(items, lastKey?)`

Creates a paginated response.

- **Parameters**:
  - `items: T[]` - Array of items
  - `lastKey?: Record<string, unknown>` - Next page key
- **Returns**: `NextResponse<PaginatedResponse<T>>` - Paginated response

### Error Handling

#### `handleApiError(error)`

Handles API errors and returns appropriate response.

- **Parameters**:
  - `error: unknown` - Error to handle
- **Returns**: `NextResponse<ErrorResponse>` - Error response with appropriate status code

## Error Mapping

The `handleApiError` function automatically maps error types to HTTP status codes:

| Error Name Pattern | Status Code | Error Code |
|--------------------|-------------|------------|
| `*NotFound*` | 404 | `NOT_FOUND` |
| `*AlreadyExists*` | 400 | `ALREADY_EXISTS` |
| `*Invalid*` | 400 | `VALIDATION_ERROR` |
| Other | 500 | `INTERNAL_ERROR` |

## Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## License

Proprietary - Nagiyu Platform
