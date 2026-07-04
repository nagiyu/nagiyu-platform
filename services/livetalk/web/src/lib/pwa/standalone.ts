import { getItem, setItem } from '@nagiyu/browser';

const INSTALL_SNOOZE_KEY = 'livetalk-install-snoozed-at';
const NOTIFICATION_SNOOZE_KEY = 'livetalk-notification-snoozed-at';
export const ONBOARDING_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3日

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mediaMatch =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(display-mode: standalone)').matches
      : false;
  return mediaMatch || (window.navigator as { standalone?: boolean }).standalone === true;
}

export type Platform = 'ios' | 'android' | 'other';

export function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'other';
  const ua = window.navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) && !(window as { MSStream?: unknown }).MSStream) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'other';
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.Notification !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

function readSnoozedAt(key: string): number | null {
  if (typeof window === 'undefined') return null;
  // @nagiyu/browser の getItem は値を JSON.parse 試行するため、
  // 数値文字列（例 "123"）は number として返る場合がある。
  // parseInt に渡す前に String() で文字列化し、従来と同じ解釈結果にする。
  const raw = getItem<string>(key);
  if (raw === null) return null;
  const ts = parseInt(String(raw), 10);
  return isNaN(ts) ? null : ts;
}

export function shouldShowInstallGuide(now: number = Date.now()): boolean {
  if (typeof window === 'undefined') return false;
  const snoozedAt = readSnoozedAt(INSTALL_SNOOZE_KEY);
  if (snoozedAt === null) return true;
  return now - snoozedAt >= ONBOARDING_COOLDOWN_MS;
}

export function snoozeInstallGuide(now: number = Date.now()): void {
  if (typeof window === 'undefined') return;
  setItem(INSTALL_SNOOZE_KEY, String(now));
}

export function shouldShowNotificationPermission(now: number = Date.now()): boolean {
  if (typeof window === 'undefined') return false;
  const snoozedAt = readSnoozedAt(NOTIFICATION_SNOOZE_KEY);
  if (snoozedAt === null) return true;
  return now - snoozedAt >= ONBOARDING_COOLDOWN_MS;
}

export function snoozeNotificationPermission(now: number = Date.now()): void {
  if (typeof window === 'undefined') return;
  setItem(NOTIFICATION_SNOOZE_KEY, String(now));
}
