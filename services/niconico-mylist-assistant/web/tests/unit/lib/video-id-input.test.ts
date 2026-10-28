import { normalizeVideoIdInput, summarizeInvalidIds } from '../../../src/lib/video-id-input';

describe('normalizeVideoIdInput', () => {
  it.each([
    ['https://www.nicovideo.jp/watch/sm9', ['sm9']],
    ['http://www.nicovideo.jp/watch/sm9', ['sm9']],
    ['nicovideo.jp/watch/sm9?ref=search', ['sm9']],
    ['https://sp.nicovideo.jp/watch/so12345#t=10', ['so12345']],
    ['https://www.nicovideo.jp/watch/nm98765/', ['nm98765']],
    ['https://nico.ms/sm9', ['sm9']],
    ['nico.ms/watch/sm9?x=1', ['sm9']],
    ['HTTPS://WWW.NICOVIDEO.JP/WATCH/SM9', ['sm9']],
  ])('URL「%s」から ID を取り出す', (input, expected) => {
    expect(normalizeVideoIdInput(input)).toEqual(expected);
  });

  it('大文字の ID を小文字にする', () => {
    expect(normalizeVideoIdInput('SM9 So12345')).toEqual(['sm9', 'so12345']);
  });

  it.each([
    ['sm1\nsm2'],
    ['sm1,sm2'],
    ['sm1 sm2'],
    ['sm1、sm2'],
    ['sm1，sm2'],
    ['sm1\u3000sm2'],
    ['sm1、 sm2'],
    [' sm1 ,\n, sm2 '],
  ])('「%s」を区切って 2 件にする', (input) => {
    expect(normalizeVideoIdInput(input)).toEqual(['sm1', 'sm2']);
  });

  it('URL と ID が混在していても整える', () => {
    expect(normalizeVideoIdInput('https://nico.ms/sm1、SM2\nnicovideo.jp/watch/so3?a=b')).toEqual([
      'sm1',
      'sm2',
      'so3',
    ]);
  });

  it('整えても形式に合わないものはそのまま(小文字で)返す', () => {
    expect(normalizeVideoIdInput('abc https://example.com/watch/sm9 sm')).toEqual([
      'abc',
      'https://example.com/watch/sm9',
      'sm',
    ]);
  });

  it('空や区切りだけの入力は空配列を返す', () => {
    expect(normalizeVideoIdInput('')).toEqual([]);
    expect(normalizeVideoIdInput(' 、，,\n\u3000')).toEqual([]);
  });
});

describe('summarizeInvalidIds', () => {
  it('上限以内なら全件を表示し、残りは 0 件', () => {
    expect(summarizeInvalidIds(['a', 'b'], 10)).toEqual({ shown: ['a', 'b'], remaining: 0 });
  });

  it('上限を超えたら先頭の数件と残りの件数に分ける', () => {
    const ids = Array.from({ length: 13 }, (_, i) => `x${i}`);
    expect(summarizeInvalidIds(ids, 10)).toEqual({ shown: ids.slice(0, 10), remaining: 3 });
  });
});
