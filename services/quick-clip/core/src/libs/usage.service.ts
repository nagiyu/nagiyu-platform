import { createHmac, randomBytes } from 'node:crypto';
import type { UsageRepository } from '../repositories/usage.repository.interface.js';
import type { UsageKind, UsageRecord } from '../types.js';
import { toDayTtlSeconds, toJstDayKey, toJstMonthKey, toMonthTtlSeconds } from './usage-period.js';
import { getUsageLimit, type UsageLimit, type UsageTier } from './usage-plan.js';

/**
 * 同じ IP から 1 日 (日本時間) に作れるジョブ数 (AI あり・なし合計) の上限。未ログインだけに適用する。
 * 携帯回線では大勢が同じ IP になるため、かなり緩くする。値は仮のもの。
 */
export const IP_DAILY_JOB_LIMIT = 20;

/** 上限を超えて断るときの理由。画面が出し分けるため文字列を固定する */
export type UsageDenyCode =
  'AI_LIMIT_EXCEEDED' | 'NO_AI_LIMIT_EXCEEDED' | 'DURATION_LIMIT_EXCEEDED' | 'IP_LIMIT_EXCEEDED';

export const USAGE_DENY_MESSAGES: Readonly<Record<UsageDenyCode, string>> = {
  AI_LIMIT_EXCEEDED: '今月の AI 解析ありの利用回数の上限に達しました',
  NO_AI_LIMIT_EXCEEDED: '今月の AI 解析なしの利用回数の上限に達しました',
  DURATION_LIMIT_EXCEEDED: '動画の長さがご利用の上限を超えています',
  IP_LIMIT_EXCEEDED: 'お使いの接続元からの本日の利用が多すぎるため、時間をおいてお試しください',
};

export type ConsumeInput = {
  /** 回数を数える主体 */
  subject: string;
  tier: UsageTier;
  /** AI 解析の希望。省略時は AI ありを試し、残りが無ければ AI なしで受ける */
  aiAnalysis?: boolean;
  /** ブラウザが申告した動画の長さ (秒)。無ければ長さの上限は判定しない */
  durationSec?: number;
  /** 接続元の IP。未ログインのときだけ補助の上限に使う */
  ip?: string;
};

export type ConsumeResult =
  { ok: true; record: UsageRecord; limit: UsageLimit } | { ok: false; code: UsageDenyCode };

export type UsageSnapshot = {
  month: string;
  tier: UsageTier;
  limits: UsageLimit;
  used: { ai: number; noAi: number };
  remaining: { ai: number; noAi: number };
};

export type UsageServiceOptions = {
  now?: () => number;
  /** 日ごとの塩の元。テストで固定するために差し替える */
  generateSalt?: () => string;
  /** 元の処理を妨げずに握った失敗を報告する先。未指定なら報告しない */
  reportError?: (message: string, error: unknown) => Promise<void>;
};

/** 利用回数の判定・加算・取り消し */
export class UsageService {
  private readonly repository: UsageRepository;
  private readonly now: () => number;
  private readonly generateSalt: () => string;
  private readonly reportError: (message: string, error: unknown) => Promise<void>;

  constructor(repository: UsageRepository, options: UsageServiceOptions = {}) {
    this.repository = repository;
    this.now = options.now ?? Date.now;
    this.generateSalt = options.generateSalt ?? ((): string => randomBytes(32).toString('hex'));
    this.reportError = options.reportError ?? (async (): Promise<void> => undefined);
  }

  /**
   * ジョブを 1 回分として数える。上限に達していれば数えずに理由を返す。
   *
   * @throws 記録先 (DynamoDB) の障害のとき。呼び出し側が報告したうえで通す (フェイルオープン)
   */
  public async consume(input: ConsumeInput): Promise<ConsumeResult> {
    const limit = getUsageLimit(input.tier);
    if (input.durationSec !== undefined && input.durationSec > limit.maxDurationSec) {
      return { ok: false, code: 'DURATION_LIMIT_EXCEEDED' };
    }

    const nowMs = this.now();
    const month = toJstMonthKey(nowMs);
    const monthTtl = toMonthTtlSeconds(nowMs);

    const tryKind = (kind: UsageKind): Promise<boolean> =>
      this.repository.tryConsume({
        subject: input.subject,
        month,
        kind,
        limit: kind === 'ai' ? limit.aiPerMonth : limit.noAiPerMonth,
        ttlSec: monthTtl,
      });

    let kind: UsageKind;
    if (input.aiAnalysis === false) {
      if (!(await tryKind('noAi'))) {
        return { ok: false, code: 'NO_AI_LIMIT_EXCEEDED' };
      }
      kind = 'noAi';
    } else if (await tryKind('ai')) {
      kind = 'ai';
    } else if (input.aiAnalysis === true) {
      return { ok: false, code: 'AI_LIMIT_EXCEEDED' };
    } else if (await tryKind('noAi')) {
      kind = 'noAi';
    } else {
      return { ok: false, code: 'NO_AI_LIMIT_EXCEEDED' };
    }

    const record: UsageRecord = {
      subject: input.subject,
      month,
      kind,
      noAiLimit: limit.noAiPerMonth,
    };

    if (input.tier === 'anonymous' && input.ip) {
      // 回数を数えたあとに確認するのは、断った申し込みが IP の数を消費しないようにするため
      let ipAllowed: boolean;
      try {
        ipAllowed = await this.tryConsumeIp(input.ip, nowMs);
      } catch (error) {
        await this.releaseQuietly(record);
        throw error;
      }
      if (!ipAllowed) {
        await this.releaseQuietly(record);
        return { ok: false, code: 'IP_LIMIT_EXCEEDED' };
      }
    }

    return { ok: true, record, limit };
  }

  /** 数えた 1 回を戻す */
  public async release(record: UsageRecord): Promise<void> {
    await this.repository.release(record);
  }

  /**
   * AI 解析ありで数えた 1 回を戻し、AI 解析なしの 1 回を数える (付け替え)。
   * AI 解析なしの上限に達していれば、AI 解析ありを戻すだけにする。
   *
   * @returns 付け替えた後の記録。AI 解析なしを数えられなかったときは undefined
   */
  public async moveToNoAi(record: UsageRecord): Promise<UsageRecord | undefined> {
    await this.release(record);
    const consumed = await this.repository.tryConsume({
      subject: record.subject,
      month: record.month,
      kind: 'noAi',
      limit: record.noAiLimit,
      ttlSec: toMonthTtlSeconds(this.now()),
    });
    return consumed ? { ...record, kind: 'noAi' } : undefined;
  }

  /** 残り回数を返す */
  public async getUsage(subject: string, tier: UsageTier): Promise<UsageSnapshot> {
    const month = toJstMonthKey(this.now());
    const limits = getUsageLimit(tier);
    const used = await this.repository.getCounts(subject, month);
    return {
      month,
      tier,
      limits,
      used,
      remaining: {
        ai: Math.max(0, limits.aiPerMonth - used.ai),
        noAi: Math.max(0, limits.noAiPerMonth - used.noAi),
      },
    };
  }

  private async tryConsumeIp(ip: string, nowMs: number): Promise<boolean> {
    const day = toJstDayKey(nowMs);
    const dayTtl = toDayTtlSeconds(nowMs);
    const salt = await this.repository.getOrCreateDailySalt(day, this.generateSalt(), dayTtl);
    // IP をそのまま保存しないため、日ごとの塩を鍵にした HMAC にする
    const ipHash = createHmac('sha256', salt).update(ip).digest('hex');
    return this.repository.tryConsumeIp({ day, ipHash, limit: IP_DAILY_JOB_LIMIT, ttlSec: dayTtl });
  }

  /** 元の例外を優先するため、戻す処理の失敗は握る */
  private async releaseQuietly(record: UsageRecord): Promise<void> {
    try {
      await this.release(record);
    } catch (error) {
      // 戻せなければ 1 回分を多く数えたままになるが、元の障害の扱いを優先して握り、報告にとどめる
      await this.reportError('QuickClip 利用回数を戻せませんでした', error);
    }
  }
}
