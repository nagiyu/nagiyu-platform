import { STUDY_DAILY_RESEARCH_LIMIT_PER_USER } from '../constants.js';
import type { StudyUsageRepository } from '../repositories/study-usage.repository.interface.js';

/**
 * 勉強 (Web リサーチ) を 1 回使えるかを問い合わせる枠。
 *
 * リサーチの種類ごとのコードが、回数の数え方 (保存先・日の区切り・配分) を知らずに済むようにする。
 */
export interface ResearchAllowance {
  /**
   * 1 回分を数える。リサーチを呼ぶ直前に呼ぶ。リサーチが失敗しても戻さない。
   *
   * @returns 使えるとき true、枠を使い切っているとき false
   * @throws 回数の記録の読み書きに失敗したとき
   */
  tryConsume(): Promise<boolean>;
}

/**
 * 勉強中のキャラクター 1 人あたりの 1 日の回数を返す。端数は使わない。
 *
 * @param studyingCount その時点で勉強中のキャラクター数。0 以下では 0
 * @param dailyLimitPerUser 利用者 1 人あたりの 1 日の上限
 */
export function computePerCharacterResearchLimit(
  studyingCount: number,
  dailyLimitPerUser: number = STUDY_DAILY_RESEARCH_LIMIT_PER_USER
): number {
  if (studyingCount <= 0) return 0;
  return Math.floor(dailyLimitPerUser / studyingCount);
}

export interface CreateDailyResearchAllowanceParams {
  studyUsageRepo: StudyUsageRepository;
  userId: string;
  characterId: string;
  /** このキャラクターが 1 日に使える回数 */
  limit: number;
  /** 利用者の全キャラクター合計の 1 日の上限 */
  totalLimit?: number;
  /** 日付の判定に使う。呼ぶたびに評価するため、日をまたいだ実行でも日付が追従する */
  now?: () => Date;
}

/** 利用者 × キャラクターの 1 日の枠を、回数のリポジトリで数える形で作る。 */
export function createDailyResearchAllowance(
  params: CreateDailyResearchAllowanceParams
): ResearchAllowance {
  const {
    studyUsageRepo,
    userId,
    characterId,
    limit,
    totalLimit = STUDY_DAILY_RESEARCH_LIMIT_PER_USER,
    now = () => new Date(),
  } = params;
  return {
    tryConsume: () =>
      studyUsageRepo.tryConsume({ userId, characterId, limit, totalLimit, nowMs: now().getTime() }),
  };
}
