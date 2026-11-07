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
   * 同じ IP の 1 日あたりのジョブ数を、上限に達していなければ 1 つ数える。
   *
   * @returns 数えられたとき true、上限に達していたとき false
   */
  tryConsumeIp(input: {
    day: string;
    ipHash: string;
    limit: number;
    ttlSec: number;
  }): Promise<boolean>;

  /**
   * その日の塩を返す。無ければ candidateSalt で作る。
   * 同時に作られても、全員が同じ塩を受け取る
   */
  getOrCreateDailySalt(day: string, candidateSalt: string, ttlSec: number): Promise<string>;
}
