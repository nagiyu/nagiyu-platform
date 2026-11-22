import { createHash } from 'crypto';

import {
  handler,
  processRequest,
  calculateBodyHash,
  ERROR_MESSAGES,
  EdgeRequest,
  EdgeResponse,
} from '../../../src/cloudfront/edge-handlers/body-hash/handler';

const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');

const createRequest = (method: string, body?: EdgeRequest['body']): EdgeRequest => ({
  method,
  headers: { host: [{ key: 'Host', value: 'example.com' }] },
  ...(body ? { body } : {}),
});

describe('body-hash edge handler', () => {
  it('base64 の本文の SHA256 を x-amz-content-sha256 に入れる', () => {
    const original = 'こんにちは world';
    const request = createRequest('POST', {
      inputTruncated: false,
      action: 'read-only',
      encoding: 'base64',
      data: Buffer.from(original, 'utf8').toString('base64'),
    });

    const result = processRequest(request) as EdgeRequest;

    expect(result.headers['x-amz-content-sha256']).toEqual([
      { key: 'x-amz-content-sha256', value: sha256(original) },
    ]);
    expect(result.headers.host).toBeDefined();
  });

  it('text の本文の SHA256 を入れる', () => {
    const request = createRequest('PUT', {
      inputTruncated: false,
      action: 'read-only',
      encoding: 'text',
      data: 'a=1&b=2',
    });

    const result = processRequest(request) as EdgeRequest;

    expect(result.headers['x-amz-content-sha256'][0].value).toBe(sha256('a=1&b=2'));
  });

  it('ビューアーが付けたハッシュは計算した値で上書きする', () => {
    const request = createRequest('POST', { encoding: 'text', data: 'x' });
    request.headers['x-amz-content-sha256'] = [{ key: 'x-amz-content-sha256', value: 'forged' }];

    const result = processRequest(request) as EdgeRequest;

    expect(result.headers['x-amz-content-sha256']).toEqual([
      { key: 'x-amz-content-sha256', value: sha256('x') },
    ]);
  });

  it('本文が無い GET は何もしない', () => {
    const request = createRequest('GET', {
      inputTruncated: false,
      action: 'read-only',
      encoding: 'base64',
      data: '',
    });

    const result = processRequest(request) as EdgeRequest;

    expect(result).toBe(request);
    expect(result.headers['x-amz-content-sha256']).toBeUndefined();
  });

  it('本文が無い GET では、ビューアーが付けたハッシュを消す', () => {
    const request = createRequest('GET');
    request.headers['x-amz-content-sha256'] = [{ key: 'x-amz-content-sha256', value: 'forged' }];

    const result = processRequest(request) as EdgeRequest;

    expect(result.headers['x-amz-content-sha256']).toBeUndefined();
  });

  it('body 自体が無い要求は何もしない', () => {
    const request = createRequest('GET');

    expect(
      (processRequest(request) as EdgeRequest).headers['x-amz-content-sha256']
    ).toBeUndefined();
  });

  it('本文が空の POST は空のハッシュを入れる', () => {
    const request = createRequest('POST');

    const result = processRequest(request) as EdgeRequest;

    expect(result.headers['x-amz-content-sha256'][0].value).toBe(sha256(''));
  });

  it('本文が切り詰められていたら 413 を返す', () => {
    const request = createRequest('POST', {
      inputTruncated: true,
      action: 'read-only',
      encoding: 'base64',
      data: 'AAAA',
    });

    const result = processRequest(request) as EdgeResponse;

    expect(result.status).toBe('413');
    expect(result.body).toBe(ERROR_MESSAGES.BODY_TOO_LARGE);
    expect(result.headers['x-amz-content-sha256']).toBeUndefined();
  });

  it('handler はイベントから要求を取り出して処理する', async () => {
    const request = createRequest('POST', { encoding: 'text', data: 'hello' });

    const result = (await handler({ Records: [{ cf: { request } }] })) as EdgeRequest;

    expect(result.headers['x-amz-content-sha256'][0].value).toBe(sha256('hello'));
  });

  it('calculateBodyHash は data が無ければ空のハッシュを返す', () => {
    expect(calculateBodyHash({})).toBe(sha256(''));
  });
});
