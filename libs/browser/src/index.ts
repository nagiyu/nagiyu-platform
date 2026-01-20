/**
 * @nagiyu/browser
 *
 * Browser API utilities library
 * Provides wrappers for browser-specific APIs with proper error handling and SSR support
 */

// Clipboard API utilities
export { readFromClipboard, writeToClipboard } from './clipboard.js';

// localStorage utilities
export { getItem, setItem, removeItem } from './localStorage.js';
