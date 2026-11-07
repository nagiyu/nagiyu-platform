/** カウンターを置くアイテムのキー */
export interface UsageCounterKey {
  PK: string;
  SK: string;
}

/** 加算の入力 */
export interface UsageCounterIncrementInput {
  key: UsageCounterKey;
  /** 数える属性名。1 アイテムに複数の属性を置ける */
  attribute: string;
  /** 上限。この値に達していたら加算しない。0 以下では常に加算しない */
  limit: number;
  /** TTL (エポック秒)。アイテムの初回作成時だけ設定し、期間内の自然な満了を保つ */
  ttlSec: number;
  /** アイテムの Type。初回作成時だけ設定する */
  itemType: string;
}

/**
 * 上限付きの回数カウンター。
 *
 * 判定と加算を 1 回の操作で行い、同時に呼ばれても上限を超えない。
 */
export interface UsageCounter {
  /**
   * 上限に達していなければ 1 加算する。
   *
   * @returns 加算できたとき true、上限に達していたとき false
   */
  tryIncrement(input: UsageCounterIncrementInput): Promise<boolean>;

  /** 1 減らす。0 以下や記録なしでは何もしない (0 未満にしない、アイテムを新しく作らない) */
  decrement(input: { key: UsageCounterKey; attribute: string }): Promise<void>;

  /** 指定した属性の現在値を一括で返す。記録が無い属性は 0。強い整合性で読む */
  read(key: UsageCounterKey, attributes: readonly string[]): Promise<Record<string, number>>;
}
