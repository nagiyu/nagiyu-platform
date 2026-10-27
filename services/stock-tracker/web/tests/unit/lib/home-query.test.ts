import { buildHomeUrl, parseTimeframe } from '../../../lib/home-query';
import { DEFAULT_TIMEFRAME } from '../../../types/stock';
import type { HomeSelection } from '../../../lib/home-query';

const EMPTY_SELECTION: HomeSelection = {
  exchangeId: '',
  tickerId: '',
  timeframe: DEFAULT_TIMEFRAME,
};

describe('parseTimeframe', () => {
  it.each(['1', '5', '60', 'D'] as const)('有効な値 %s はそのまま返す', (value) => {
    expect(parseTimeframe(value)).toBe(value);
  });

  it.each([null, undefined, '', '15', 'd', 'toString', '60 '])(
    '未指定・不正値 %p は既定値になる',
    (value) => {
      expect(parseTimeframe(value)).toBe('60');
    }
  );

  it('既定値は 60 である', () => {
    expect(DEFAULT_TIMEFRAME).toBe('60');
  });
});

describe('buildHomeUrl', () => {
  it('取引所・銘柄・時間枠をクエリに載せる', () => {
    expect(
      buildHomeUrl('/', '', {
        exchangeId: 'NASDAQ',
        tickerId: 'NASDAQ:AAPL',
        timeframe: 'D',
      })
    ).toBe('/?exchangeId=NASDAQ&tickerId=NASDAQ%3AAAPL&timeframe=D');
  });

  it('時間枠が既定値のときは URL に載せない', () => {
    expect(
      buildHomeUrl('/', '', { exchangeId: 'NASDAQ', tickerId: '', timeframe: DEFAULT_TIMEFRAME })
    ).toBe('/?exchangeId=NASDAQ');
  });

  it('未選択の項目は URL から消す', () => {
    expect(
      buildHomeUrl('/', 'exchangeId=NASDAQ&tickerId=NASDAQ%3AAAPL&timeframe=5', EMPTY_SELECTION)
    ).toBe('/');
  });

  it('取引所だけ未選択にしたとき、他の項目は残す', () => {
    expect(
      buildHomeUrl('/', 'exchangeId=NASDAQ&timeframe=5', {
        exchangeId: '',
        tickerId: '',
        timeframe: '5',
      })
    ).toBe('/?timeframe=5');
  });

  it('既存の値を更新する', () => {
    expect(
      buildHomeUrl('/', 'exchangeId=NASDAQ&tickerId=NASDAQ%3AAAPL', {
        exchangeId: 'NYSE',
        tickerId: '',
        timeframe: '60',
      })
    ).toBe('/?exchangeId=NYSE');
  });

  it('いまの URL と同じ内容なら null を返す', () => {
    expect(
      buildHomeUrl('/', 'exchangeId=NASDAQ&tickerId=NASDAQ%3AAAPL&timeframe=D', {
        exchangeId: 'NASDAQ',
        tickerId: 'NASDAQ:AAPL',
        timeframe: 'D',
      })
    ).toBeNull();
  });

  it('クエリが無く未選択のままなら null を返す', () => {
    expect(buildHomeUrl('/', '', EMPTY_SELECTION)).toBeNull();
  });

  it('エンコード表記や先頭の ? の違いだけなら null を返す', () => {
    expect(
      buildHomeUrl('/', '?tickerId=NASDAQ:AAPL&exchangeId=NASDAQ', {
        exchangeId: 'NASDAQ',
        tickerId: 'NASDAQ:AAPL',
        timeframe: '60',
      })
    ).toBeNull();
  });

  it('既定値が明示されたクエリや不正な時間枠は正規化のため書き換える', () => {
    expect(buildHomeUrl('/', 'timeframe=60', EMPTY_SELECTION)).toBe('/');
    expect(buildHomeUrl('/', 'timeframe=bogus', EMPTY_SELECTION)).toBe('/');
  });

  it('管轄外のクエリは保持する', () => {
    expect(
      buildHomeUrl('/', 'foo=bar&exchangeId=NASDAQ', {
        exchangeId: 'NASDAQ',
        tickerId: 'NASDAQ:AAPL',
        timeframe: '1',
      })
    ).toBe('/?foo=bar&exchangeId=NASDAQ&tickerId=NASDAQ%3AAAPL&timeframe=1');
  });

  it('指定したパスに対する URL を返す', () => {
    expect(buildHomeUrl('/stocks', '', { ...EMPTY_SELECTION, exchangeId: 'NYSE' })).toBe(
      '/stocks?exchangeId=NYSE'
    );
  });
});
