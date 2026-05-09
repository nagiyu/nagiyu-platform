import { getItem, removeItem, setItem } from '@nagiyu/browser';

export const LAST_VISITED_PATH_STORAGE_KEY = 'share-together:last-visited-path';

const NON_PERSISTABLE_PATHS: ReadonlySet<string> = new Set(['/']);

export function isRecordablePath(path: string): boolean {
  return path.startsWith('/');
}

export function isPersistablePath(path: string): boolean {
  if (!isRecordablePath(path)) {
    return false;
  }
  return !NON_PERSISTABLE_PATHS.has(path);
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
