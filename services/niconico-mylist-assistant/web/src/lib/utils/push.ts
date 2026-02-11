/**
 * Base64 URL エンコードされた文字列を Uint8Array に変換
 *
 * Web Push の VAPID キーは Base64 URL エンコード形式で提供されるため、
 * ブラウザの PushManager.subscribe() で使用する前にこの関数で変換する必要があります。
 *
 * @param base64String - Base64 URL エンコードされた文字列
 * @returns Uint8Array
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
