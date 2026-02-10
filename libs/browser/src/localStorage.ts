/**
 * localStorage utilities with SSR support and error handling
 */

/**
 * Check if we are in a browser environment with localStorage available
 */
function isLocalStorageAvailable(): boolean {
  try {
    return (
      typeof globalThis !== 'undefined' &&
      typeof globalThis.window !== 'undefined' &&
      typeof globalThis.window.localStorage !== 'undefined'
    );
  } catch {
    return false;
  }
}

/**
 * Get an item from localStorage
 * Returns null if the item doesn't exist or if localStorage is not available
 *
 * @template T - The type of the stored value
 * @param key - The key to retrieve
 * @returns The parsed value or null
 *
 * @example
 * // Get a string value
 * const name = getItem<string>('userName');
 *
 * @example
 * // Get an object value
 * const settings = getItem<{ theme: string }>('settings');
 */
export function getItem<T = string>(key: string): T | null {
  try {
    if (!isLocalStorageAvailable()) {
      return null;
    }

    const item = globalThis.window.localStorage.getItem(key);
    if (item === null) {
      return null;
    }

    // Try to parse as JSON, fallback to raw string
    try {
      return JSON.parse(item) as T;
    } catch {
      // If parsing fails, return the raw string
      return item as T;
    }
  } catch (error) {
    console.error(`[localStorage] Failed to get item "${key}":`, error);
    return null;
  }
}

/**
 * Set an item in localStorage
 * Automatically stringifies objects using JSON.stringify
 *
 * @template T - The type of the value to store
 * @param key - The key to store under
 * @param value - The value to store
 *
 * @example
 * // Store a string value
 * setItem('userName', 'John');
 *
 * @example
 * // Store an object value
 * setItem('settings', { theme: 'dark', language: 'ja' });
 */
export function setItem<T = string>(key: string, value: T): void {
  try {
    if (!isLocalStorageAvailable()) {
      console.warn('[localStorage] localStorage is not available (SSR or private mode)');
      return;
    }

    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    globalThis.window.localStorage.setItem(key, stringValue);
  } catch (error) {
    // Check if it's a quota exceeded error
    if (
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' ||
        error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        error.code === 22)
    ) {
      console.error(`[localStorage] Storage quota exceeded for key "${key}"`);
      throw new Error('ストレージの容量が不足しています。不要なデータを削除してください。', {
        cause: error,
      });
    }
    console.error(`[localStorage] Failed to set item "${key}":`, error);
    throw new Error('データの保存に失敗しました。', { cause: error });
  }
}

/**
 * Remove an item from localStorage
 *
 * @param key - The key to remove
 *
 * @example
 * removeItem('userName');
 */
export function removeItem(key: string): void {
  try {
    if (!isLocalStorageAvailable()) {
      console.warn('[localStorage] localStorage is not available (SSR or private mode)');
      return;
    }

    globalThis.window.localStorage.removeItem(key);
  } catch (error) {
    console.error(`[localStorage] Failed to remove item "${key}":`, error);
    throw new Error('データの削除に失敗しました。', { cause: error });
  }
}
