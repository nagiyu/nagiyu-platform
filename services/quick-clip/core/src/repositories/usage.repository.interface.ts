import type { UsageKind } from '../types.js';

export type UsageCounts = { ai: number; noAi: number };

/**
 * 利用回数の記録。
 *
 * 判定と加算は 1 回の操作で行い、同時に申し込まれても上限を超えないようにする。
 */
export interface UsageRepository {
  /**
   * 上限に達していなければ 1 回数える。
   *
   * @returns 数えられたとき true、上限に達していたとき false
   */
  tryConsume(input: {
    subject: string;
    month: string;
    kind: UsageKind;
    limit: number;
    ttlSec: number;
  }): Promise<boolean>;

  /** 数えた 1 回を戻す。0 未満にはならない */
  release(input: { subject: string; month: string; kind: UsageKind }): Promise<void>;

  /** その月に数えた回数を返す。記録が無ければ 0 */
  getCounts(subject: string, month: string): Promise<UsageCounts>;

  /**
   * 月の 1 回を数えたあと、続けて同じ IP の 1 日あたりのジョブ数を数える。
   *
   * IP を後に数えるのは、月の上限で断った申し込みが IP の数を消費しないようにするため。
   * IP が断った (または障害になった) ときは、月の 1 回を戻す。戻しの失敗は呼び出し側へ伝えず握り、
   * onRollbackError にだけ渡す。
   *
   * @param input.ip 省略時は月の 1 回だけを数える。塩の取得を挟むため、月の 1 回が通ったあとに入力を作る関数で渡す
   * @returns 両方数えたとき ok、断られた側を denied に入れる
   * @throws 記録先 (DynamoDB) や ip の入力作成の障害のとき (数えた分は戻す)
   */
  tryConsumeWithIp(input: {
    monthly: { subject: string; month: string; kind: UsageKind; limit: number; ttlSec: number };
    ip?: () => Promise<{ day: string; ipHash: string; limit: number; ttlSec: number }>;
    onRollbackError?: (error: unknown) => unknown;
  }): Promise<{ ok: true } | { ok: false; denied: 'monthly' | 'ip' }>;

  /**
   * その日の塩を返す。無ければ candidateSalt で作る。
   * 同時に作られても、全員が同じ塩を受け取る
   */
  getOrCreateDailySalt(day: string, candidateSalt: string, ttlSec: number): Promise<string>;
}
