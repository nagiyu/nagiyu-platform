import { readJsonObjectBody } from '../../src/request-body.js';

const createRequest = (body?: string): Request =>
  new Request('http://localhost', { method: 'POST', body });

describe('readJsonObjectBody', () => {
  it('正常なオブジェクトを読み取れる', async () => {
    const result = await readJsonObjectBody(createRequest('{"name":"a","n":1}'));
    expect(result).toEqual({ ok: true, body: { name: 'a', n: 1 } });
  });

  it.each([
    ['壊れた JSON', '{bad'],
    ['空ボディ', ''],
    ['null', 'null'],
    ['配列', '[1,2]'],
    ['数値', '123'],
    ['文字列リテラル', '"x"'],
    ['真偽値', 'true'],
  ])('%s は ok: false を返す', async (_label, body) => {
    const result = await readJsonObjectBody(createRequest(body));
    expect(result).toEqual({ ok: false });
  });

  it('ボディ読み取り済みでも例外を投げず ok: false を返す', async () => {
    const request = createRequest('{"a":1}');
    await request.text();
    await expect(readJsonObjectBody(request)).resolves.toEqual({ ok: false });
  });
});
