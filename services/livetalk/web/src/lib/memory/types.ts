/**
 * 記憶 UI / API で受け渡しする SELF fact の DTO
 * （リブトーク知識再設計 P2 / #3698、Topic 中心モデルへの移行）。
 *
 * DynamoDB の SK（`CHAR#<char>#TOPIC#<topicId>#SELF#<factId>`）は URL に乗せにくいため、
 * `id` には base64url エンコードした完全 SK を入れる（`lib/memory/memory-id.ts` 参照）。
 */
export interface SelfFactListItem {
  /** base64url エンコードした完全 SK。DELETE の `:id` に使う */
  id: string;
  topicId: string;
  /** 所属 Topic の主題（グルーピング表示用） */
  subject: string;
  text: string;
  createdAt: number;
}
