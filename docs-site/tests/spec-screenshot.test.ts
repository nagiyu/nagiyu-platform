import {
  DEVICES,
  assertUniqueImages,
  cardImageLink,
  imageFileName,
  imageRepoPath,
  resolveDevices,
} from '../src/spec-screenshot';

describe('imageFileName', () => {
  it('画面・状態・端末の順につなぐ', () => {
    expect(imageFileName('tickers', 'create-dialog', 'mobile')).toBe(
      'tickers-create-dialog-mobile.png'
    );
  });

  it('大文字や空白を含む名前は受け付けない', () => {
    expect(() => imageFileName('Tickers', 'a', 'mobile')).toThrow('画面名');
    expect(() => imageFileName('tickers', 'create dialog', 'desktop')).toThrow('状態名');
  });
});

describe('imageRepoPath / cardImageLink', () => {
  it('docs/images/specs 配下のパスを返す', () => {
    expect(imageRepoPath('stock-tracker', 'screen', 'a-b-mobile.png')).toBe(
      'docs/images/specs/stock-tracker/screen/a-b-mobile.png'
    );
  });

  it('カードからは docs 内の相対リンクになる', () => {
    expect(cardImageLink('stock-tracker', 'screen', 'a-b-mobile.png')).toBe(
      '../../../images/specs/stock-tracker/screen/a-b-mobile.png'
    );
  });

  it('不正なサービス名は受け付けない', () => {
    expect(() => imageRepoPath('Stock Tracker', 'screen', 'a.png')).toThrow('サービス名');
  });
});

describe('assertUniqueImages', () => {
  it('重なりがなければ通る', () => {
    expect(() => assertUniqueImages(['a.png', 'b.png'])).not.toThrow();
  });

  it('重なりがあれば止める', () => {
    expect(() => assertUniqueImages(['a.png', 'a.png'])).toThrow('a.png');
  });
});

describe('resolveDevices', () => {
  it('重複を除いて返す', () => {
    expect(resolveDevices('svc', ['mobile', 'desktop', 'mobile'])).toEqual(['mobile', 'desktop']);
  });

  it('空なら止める', () => {
    expect(() => resolveDevices('svc', [])).toThrow('svc');
  });
});

describe('DEVICES', () => {
  it('スマホは 390×844、PC は 1280×800', () => {
    expect(DEVICES.mobile).toMatchObject({ width: 390, height: 844 });
    expect(DEVICES.desktop).toMatchObject({ width: 1280, height: 800 });
  });
});
