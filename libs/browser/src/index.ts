/**
 * @nagiyu/browser
 *
 * Browser API utilities library
 * Provides wrappers for browser-specific APIs with proper error handling and SSR support
 */

// Clipboard API utilities
export { readFromClipboard, writeToClipboard } from './clipboard';

// localStorage utilities
export { getItem, setItem, removeItem } from './localStorage';

// Web Push utilities
export {
  subscribePush,
  isPushSupported,
  registerServiceWorker,
  getPushSubscription,
  refreshPushSubscription,
  unsubscribePush,
  PUSH_ERROR_MESSAGES,
} from './push';
export type { SubscribePushOptions, PushEndpointOptions } from './push';
