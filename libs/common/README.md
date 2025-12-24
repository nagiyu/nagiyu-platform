# @nagiyu/common

Framework-agnostic common utility library for Nagiyu Platform.

## Overview

`@nagiyu/common` is a shared library package that provides common utilities and type definitions that can be used across all services in the Nagiyu Platform. This package has no external dependencies and is completely framework-agnostic.

## Installation

This package is designed to be used within the Nagiyu Platform monorepo via npm workspaces.

```json
{
  "dependencies": {
    "@nagiyu/common": "workspace:*"
  }
}
```

## Usage

```typescript
// Utilities will be added in future phases
import {} from '@nagiyu/common';
```

## Design Principles

- **Zero Dependencies**: No external dependencies, only Node.js standard library
- **Framework Agnostic**: Can be used with any framework (Next.js, React, Vue, etc.)
- **Pure Functions**: All utilities are implemented as pure functions
- **Type Safe**: Full TypeScript support with strict type checking
- **High Test Coverage**: Maintained at 80%+ code coverage

## Library Structure

```
libs/common/
├── src/                    # Source code
│   └── index.ts           # Main export file
├── tests/                  # Test files
│   └── unit/              # Unit tests
├── dist/                   # Build output (generated)
├── package.json           # Package configuration
├── tsconfig.json          # TypeScript configuration
├── jest.config.ts         # Jest configuration
└── README.md              # This file
```

## Development

### Building

```bash
npm run build
```

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Linting and Formatting

```bash
# Run linter
npm run lint

# Format code
npm run format

# Check formatting
npm run format:check
```

## Internal Implementation Rules

### No Path Aliases

Within this library, use relative paths only. Path aliases (like `@/...`) are not allowed to ensure consistency when the library is distributed.

```typescript
// ❌ Don't use path aliases
import { something } from '@/utils/helper';

// ✅ Use relative paths
import { something } from '../utils/helper';
```

## Dependency Rules

This library is at the bottom of the dependency hierarchy:

```
libs/ui → libs/browser → libs/common
```

- `libs/common` has NO dependencies on other libs
- Other libraries can depend on `libs/common`
- Circular dependencies are strictly prohibited

## Future Enhancements

Currently, this package serves as a foundation for future common utilities:

- Common type definitions
- Data transformation utilities
- Validation helpers
- Pure utility functions

New utilities will be added as they are extracted from services or identified as common patterns.

## Version

Current version: 1.0.0

See [shared-libraries.md](../../docs/development/shared-libraries.md) for the overall library design.

## License

MIT
