jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

import {
  createConflictErrorResponse,
  createForbiddenErrorResponse,
  createInternalServerErrorResponse,
  createNotFoundErrorResponse,
  createValidationErrorResponse,
} from '@/lib/api/responses';
import { ERROR_MESSAGES } from '@/lib/constants/errors';

describe('lib/api/responses', () => {
  it('createValidationErrorResponse は既定文言で 400 を返す', async () => {
    const response = createValidationErrorResponse();
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'VALIDATION_ERROR',
      message: ERROR_MESSAGES.VALIDATION_ERROR,
    });
  });

  it('createValidationErrorResponse は文言を指定できる', async () => {
    const response = createValidationErrorResponse(ERROR_MESSAGES.LIST_NAME_INVALID);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'VALIDATION_ERROR',
      message: ERROR_MESSAGES.LIST_NAME_INVALID,
    });
  });

  it('createNotFoundErrorResponse は 404 を返す', async () => {
    const response = createNotFoundErrorResponse();
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'NOT_FOUND',
      message: ERROR_MESSAGES.NOT_FOUND,
    });
  });

  it('createForbiddenErrorResponse は既定で FORBIDDEN を返す', async () => {
    const response = createForbiddenErrorResponse();
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'FORBIDDEN',
      message: ERROR_MESSAGES.FORBIDDEN,
    });
  });

  it('createForbiddenErrorResponse はコードと文言を指定できる', async () => {
    const response = createForbiddenErrorResponse('OWNER_ONLY', ERROR_MESSAGES.OWNER_ONLY);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'OWNER_ONLY',
      message: ERROR_MESSAGES.OWNER_ONLY,
    });
  });

  it('createConflictErrorResponse は 409 を返す', async () => {
    const response = createConflictErrorResponse('ALREADY_MEMBER', ERROR_MESSAGES.ALREADY_MEMBER);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'ALREADY_MEMBER',
      message: ERROR_MESSAGES.ALREADY_MEMBER,
    });
  });

  it('createInternalServerErrorResponse は 500 を返す', async () => {
    const response = createInternalServerErrorResponse();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'INTERNAL_SERVER_ERROR',
      message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
    });
  });
});
