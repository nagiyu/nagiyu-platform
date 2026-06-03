import {
  isStandalone,
  detectPlatform,
  isPushSupported,
  shouldShowInstallGuide,
  snoozeInstallGuide,
  shouldShowNotificationPermission,
  snoozeNotificationPermission,
  ONBOARDING_COOLDOWN_MS,
} from '@/lib/pwa/standalone';

const INSTALL_KEY = 'livetalk-install-snoozed-at';
const NOTIFICATION_KEY = 'livetalk-notification-snoozed-at';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------- isStandalone ----------

describe('isStandalone', () => {
  it('matchMedia が standalone を返すとき true', () => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: true });
    expect(isStandalone()).toBe(true);
  });

  it('navigator.standalone が true のとき true（iOS Safari）', () => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: false });
    Object.defineProperty(window.navigator, 'standalone', {
      value: true,
      configurable: true,
    });
    expect(isStandalone()).toBe(true);
    Object.defineProperty(window.navigator, 'standalone', { value: undefined, configurable: true });
  });

  it('matchMedia が false かつ navigator.standalone が falsy のとき false', () => {
    window.matchMedia = jest.fn().mockReturnValue({ matches: false });
    expect(isStandalone()).toBe(false);
  });

  it('matchMedia が存在しない環境でも例外を投げない', () => {
    // @ts-expect-error テスト用
    window.matchMedia = undefined;
    expect(() => isStandalone()).not.toThrow();
    expect(isStandalone()).toBe(false);
    // restore
    window.matchMedia = jest.fn().mockReturnValue({ matches: false });
  });
});

// ---------- detectPlatform ----------

describe('detectPlatform', () => {
  const setUA = (ua: string) => {
    Object.defineProperty(window.navigator, 'userAgent', {
      value: ua,
      configurable: true,
    });
  };

  it('iPhone UA で ios を返す', () => {
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    expect(detectPlatform()).toBe('ios');
  });

  it('iPad UA で ios を返す', () => {
    setUA('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)');
    expect(detectPlatform()).toBe('ios');
  });

  it('iPod UA で ios を返す', () => {
    setUA('Mozilla/5.0 (iPod touch; CPU iPhone OS 17_0 like Mac OS X)');
    expect(detectPlatform()).toBe('ios');
  });

  it('Android UA で android を返す', () => {
    setUA('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36');
    expect(detectPlatform()).toBe('android');
  });

  it('デスクトップ UA で other を返す', () => {
    setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    expect(detectPlatform()).toBe('other');
  });
});

// ---------- isPushSupported ----------

describe('isPushSupported', () => {
  it('Notification・serviceWorker・PushManager がすべてあれば true', () => {
    Object.defineProperty(window, 'Notification', {
      value: { permission: 'default' },
      configurable: true,
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register: jest.fn() },
      configurable: true,
    });
    Object.defineProperty(window, 'PushManager', {
      value: function PushManager() {},
      configurable: true,
    });
    expect(isPushSupported()).toBe(true);
  });

  it('Notification がなければ false', () => {
    const original = window.Notification;
    // @ts-expect-error テスト用
    delete window.Notification;
    expect(isPushSupported()).toBe(false);
    Object.defineProperty(window, 'Notification', { value: original, configurable: true });
  });
});

// ---------- shouldShowInstallGuide / snoozeInstallGuide ----------

describe('shouldShowInstallGuide', () => {
  it('localStorage に値がなければ true を返す', () => {
    expect(shouldShowInstallGuide(Date.now())).toBe(true);
  });

  it('クールダウン内なら false を返す', () => {
    const now = Date.now();
    snoozeInstallGuide(now - 1000);
    expect(shouldShowInstallGuide(now)).toBe(false);
  });

  it('クールダウン経過後なら true を返す', () => {
    const now = Date.now();
    snoozeInstallGuide(now - ONBOARDING_COOLDOWN_MS - 1);
    expect(shouldShowInstallGuide(now)).toBe(true);
  });

  it('不正な値が保存されていても true を返す', () => {
    localStorage.setItem(INSTALL_KEY, 'invalid');
    expect(shouldShowInstallGuide(Date.now())).toBe(true);
  });
});

describe('snoozeInstallGuide', () => {
  it('指定時刻を localStorage に保存する', () => {
    const now = 1_700_000_000_000;
    snoozeInstallGuide(now);
    expect(localStorage.getItem(INSTALL_KEY)).toBe(String(now));
  });

  it('引数なしで呼んでも保存される', () => {
    snoozeInstallGuide();
    expect(localStorage.getItem(INSTALL_KEY)).not.toBeNull();
  });
});

// ---------- shouldShowNotificationPermission / snoozeNotificationPermission ----------

describe('shouldShowNotificationPermission', () => {
  it('localStorage に値がなければ true を返す', () => {
    expect(shouldShowNotificationPermission(Date.now())).toBe(true);
  });

  it('クールダウン内なら false を返す', () => {
    const now = Date.now();
    snoozeNotificationPermission(now - 1000);
    expect(shouldShowNotificationPermission(now)).toBe(false);
  });

  it('クールダウン経過後なら true を返す', () => {
    const now = Date.now();
    snoozeNotificationPermission(now - ONBOARDING_COOLDOWN_MS - 1);
    expect(shouldShowNotificationPermission(now)).toBe(true);
  });

  it('不正な値が保存されていても true を返す', () => {
    localStorage.setItem(NOTIFICATION_KEY, 'not-a-number');
    expect(shouldShowNotificationPermission(Date.now())).toBe(true);
  });
});

describe('snoozeNotificationPermission', () => {
  it('指定時刻を localStorage に保存する', () => {
    const now = 1_700_000_000_000;
    snoozeNotificationPermission(now);
    expect(localStorage.getItem(NOTIFICATION_KEY)).toBe(String(now));
  });

  it('引数なしで呼んでも保存される', () => {
    snoozeNotificationPermission();
    expect(localStorage.getItem(NOTIFICATION_KEY)).not.toBeNull();
  });
});
