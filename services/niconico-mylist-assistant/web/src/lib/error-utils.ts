export function extractErrorMessage(errorData: unknown, defaultMessage: string): string {
  if (typeof errorData !== 'object' || errorData === null) {
    return defaultMessage;
  }

  const candidate = errorData as {
    message?: unknown;
    error?: {
      message?: unknown;
    };
  };

  if (typeof candidate.message === 'string') {
    return candidate.message;
  }

  if (typeof candidate.error?.message === 'string') {
    return candidate.error.message;
  }

  return defaultMessage;
}
