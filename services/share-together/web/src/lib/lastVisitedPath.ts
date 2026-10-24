import { getItem, removeItem, setItem } from '@nagiyu/browser';

export const LAST_VISITED_PATH_STORAGE_KEY = 'share-together:last-visited-path';

// 既存セッションのフラグを引き継ぐため、PR #2982 で導入されたキー値をそのまま使用する。
export const SESSION_BOOTSTRAP_STORAGE_KEY = 'share-together:home-redirect-checked';

export function isRecordablePath(path: string): boolean {
  return path.startsWith('/');
}

/**
 * パスとクエリを保存・復元に使う 1 つの文字列にする。
 * リスト画面は表示中のリストをクエリで表すため、パスだけでは前回の状態に戻れない。
 */
export function buildVisitedPath(pathname: string, search: string): string {
  return search ? `${pathname}?${search}` : pathname;
}

export function loadLastVisitedPath(): string | null {
  return getItem<string>(LAST_VISITED_PATH_STORAGE_KEY);
}

export function saveLastVisitedPath(path: string): void {
  setItem<string>(LAST_VISITED_PATH_STORAGE_KEY, path);
}

export function clearLastVisitedPath(): void {
  removeItem(LAST_VISITED_PATH_STORAGE_KEY);
}
