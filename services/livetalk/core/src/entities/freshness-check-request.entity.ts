/**
 * Topic の WEB fact の鮮度を確認する依頼。
 *
 * 会話や通知で Topic が使われたとき、その Topic に期限切れの WEB fact があれば記録する。
 * acquire バッチが古い順に処理し、調べ終えたら削除する。
 * 期限ごとに全 Topic を走査すると会話に出ない Topic まで調べ直してしまうため、使われた Topic だけを対象にする。
 * 同じ Topic への依頼は同じキーに上書きされる (冪等)。
 *
 * DynamoDB SK: `CHAR#<charId>#FRESHCHECK#<topicId>`
 */
export interface FreshnessCheckRequestEntity {
  userId: string;
  characterId: string;
  topicId: string;
  /** 依頼した時刻 (Unix ms)。処理順 (古い順) に使う */
  createdAt: number;
  updatedAt: number;
  /** 自動削除する時刻 (Unix ms)。保存時は TTL 属性のエポック秒になる */
  expiresAt?: number;
}

export interface FreshnessCheckRequestKey {
  userId: string;
  characterId: string;
  topicId: string;
}

export type PutFreshnessCheckRequestInput = FreshnessCheckRequestKey &
  Pick<FreshnessCheckRequestEntity, 'expiresAt'>;
