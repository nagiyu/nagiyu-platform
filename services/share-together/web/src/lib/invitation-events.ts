/**
 * 招待の承認・拒否で未処理の招待数が変わったことを、ヘッダーのバッジへ伝えるイベント名。
 * 招待一覧とヘッダーは別のコンポーネントツリーにあり、状態を共有できないため window 経由で通知する。
 */
export const INVITATIONS_CHANGED_EVENT = 'share-together:invitations-changed';

/** 未処理の招待数が変わったことを通知する。 */
export function notifyInvitationsChanged(): void {
  window.dispatchEvent(new Event(INVITATIONS_CHANGED_EVENT));
}
