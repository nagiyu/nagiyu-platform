/**
 * Error Reporting Unit Tests
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { NextResponse } from 'next/server';
import { withAuth, type AuthFunction } from '../../src/auth';
import { createApiErrorReporting, type ApiErrorReportInput } from '../../src/error-reporting';

describe('createApiErrorReporting', () => {
  let report: jest.Mock<(input: ApiErrorReportInput) => Promise<unknown>>;
  let errorSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    report = jest.fn<(input: ApiErrorReportInput) => Promise<unknown>>().mockResolvedValue(null);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  const create = (toErrorResponse?: (error: unknown) => Response) =>
    createApiErrorReporting({ serviceId: 'svc', report, toErrorResponse });

  it('正常に返したレスポンスはそのまま返し報告しない', async () => {
    const expected = NextResponse.json({ ok: true });
    const wrapped = create()('GET /x', async () => expected);
    expect(await wrapped()).toBe(expected);
    expect(report).not.toHaveBeenCalled();
  });

  it('ハンドラが 5xx を返り値で返しても報告しない', async () => {
    const wrapped = create()('GET /x', async () => new Response(null, { status: 503 }));
    const res = await wrapped();
    expect(res.status).toBe(503);
    expect(report).not.toHaveBeenCalled();
  });

  it('500 になる例外を 1 回報告し context を組み立てる', async () => {
    const error = new Error('boom');
    const wrapped = create()('GET /items', async (request: Request) => {
      void request;
      throw error;
    });
    const res = await wrapped(
      new Request('http://localhost/api/items?email=a@example.com', { method: 'POST' })
    );

    expect(res.status).toBe(500);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith({
      serviceId: 'svc',
      severity: 'error',
      title: 'GET /items',
      message: 'boom',
      context: {
        method: 'POST',
        pathname: '/api/items',
        errorName: 'Error',
        errorMessage: 'boom',
        errorStack: error.stack,
      },
    });
  });

  it('第 1 引数が Request でなければ method と pathname を含めない', async () => {
    const wrapped = create()('job', async (arg: string) => {
      void arg;
      throw new Error('boom');
    });
    await wrapped('x');
    const input = report.mock.calls[0][0];
    expect(input.context).not.toHaveProperty('method');
    expect(input.context).not.toHaveProperty('pathname');
  });

  it('Error 以外が投げられても報告できる', async () => {
    const wrapped = create()('job', async () => {
      throw 'oops';
    });
    await wrapped();
    const input = report.mock.calls[0][0];
    expect(input.context.errorName).toBe('string');
    expect(input.context).not.toHaveProperty('errorStack');
  });

  it('url が不正な Request でも method だけで報告する', async () => {
    const request = new Request('http://localhost/x');
    Object.defineProperty(request, 'url', { value: 'not a url' });
    const wrapped = create()('job', async (r: Request) => {
      void r;
      throw new Error('boom');
    });
    await wrapped(request);
    expect(report.mock.calls[0][0].context).toMatchObject({ method: 'GET' });
    expect(report.mock.calls[0][0].context).not.toHaveProperty('pathname');
  });

  it('404 にマッピングされる例外は報告しない', async () => {
    const error = new Error('なし');
    error.name = 'EntityNotFoundError';
    const wrapped = create()('GET /x', async () => {
      throw error;
    });
    expect((await wrapped()).status).toBe(404);
    expect(report).not.toHaveBeenCalled();
  });

  it('400 にマッピングされる例外は報告しない', async () => {
    const error = new Error('不正');
    error.name = 'InvalidEntityDataError';
    const wrapped = create()('GET /x', async () => {
      throw error;
    });
    expect((await wrapped()).status).toBe(400);
    expect(report).not.toHaveBeenCalled();
  });

  it('toErrorResponse 指定時はそれでレスポンスを作り status で報告可否を決める', async () => {
    const toErrorResponse = jest.fn((error: unknown) =>
      error ? new Response('custom', { status: 502 }) : new Response()
    );
    const wrapped = create(toErrorResponse)('GET /x', async () => {
      throw new Error('boom');
    });
    const res = await wrapped();
    expect(res.status).toBe(502);
    expect(toErrorResponse).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledTimes(1);

    const quiet = create(() => new Response('x', { status: 409 }))('GET /x', async () => {
      throw new Error('boom');
    });
    report.mockClear();
    expect((await quiet()).status).toBe(409);
    expect(report).not.toHaveBeenCalled();
  });

  it('report が reject してもレスポンスを返し console.error に残す', async () => {
    report.mockRejectedValue(new Error('報告失敗'));
    const wrapped = create()('GET /x', async () => {
      throw new Error('boom');
    });
    const res = await wrapped();
    expect(res.status).toBe(500);
    expect(errorSpy).toHaveBeenCalledWith(
      '[withApiErrorReporting] エラー報告に失敗しました',
      expect.any(Error)
    );
  });

  it('引数をそのままハンドラへ渡す', async () => {
    const handler = jest.fn(async (request: Request, ctx: { params: Promise<{ id: string }> }) =>
      NextResponse.json({ ok: Boolean(request && ctx) })
    );
    const wrapped = create()('GET /x/[id]', handler);
    const request = new Request('http://localhost/x/1');
    const ctx = { params: Promise.resolve({ id: '1' }) };
    await wrapped(request, ctx);
    expect(handler).toHaveBeenCalledWith(request, ctx);
  });

  it('withAuth の内側で起きた例外もラッパーが報告して 500 にする', async () => {
    const auth: AuthFunction = async () => ({
      user: { id: 'u', email: 'a@example.com', name: 'n', roles: [] },
      expires: '2099-01-01T00:00:00Z',
    });
    const wrapped = create()(
      'GET /x',
      withAuth(auth, null, async () => {
        throw new Error('boom');
      })
    );
    const res = await wrapped();
    expect(res.status).toBe(500);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0][0].title).toBe('GET /x');
  });
});
