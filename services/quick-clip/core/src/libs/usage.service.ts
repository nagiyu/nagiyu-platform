import { createHmac, randomBytes } from 'node:crypto';
import type { JobRepository } from '../repositories/job.repository.interface.js';
import type { UsageRepository } from '../repositories/usage.repository.interface.js';
import type { Job, UsageKind, UsageRecord } from '../types.js';
import { toDayTtlSeconds, toJstDayKey, toJstMonthKey, toMonthTtlSeconds } from '@nagiyu/common';
import { getUsageLimit, type UsageLimit, type UsageTier } from './usage-plan.js';

/**
 * 同じ IP から 1 日 (日本時間) に作れるジョブ数 (AI あり・なし合計) の上限。未ログインだけに適用する。
 * 携帯回線では大勢が同じ IP になるため、かなり緩くする。値は仮のもの。
 */
export const IP_DAILY_JOB_LIMIT = 20;

const ROLLBACK_FAILED_MESSAGE = 'QuickClip 利用回数を戻せませんでした';

type IpCountInput = { day: string; ipHash: string; limit: number; ttlSec: number };

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
  | {
      ok: true;
      /** 数えた 1 回の記録。上限なしの段では数えないため無い */
      record?: UsageRecord;
      /** この申し込みで AI 解析を行うか */
      aiAnalysis: boolean;
      limit: UsageLimit;
    }
  | { ok: false; code: UsageDenyCode };

export type UsageSnapshot = {
  month: string;
  tier: UsageTier;
  limits: UsageLimit;
  used: { ai: number; noAi: number };
  /** 残り回数。null は上限なし */
  remaining: { ai: number | null; noAi: number | null };
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

    const { aiPerMonth, noAiPerMonth } = limit;
    if (aiPerMonth === null || noAiPerMonth === null) {
      // カウンターは上限を守るためだけのものなので、上限なしの段では触れず記録も残さない
      return { ok: true, aiAnalysis: input.aiAnalysis !== false, limit };
    }

    const nowMs = this.now();
    const month = toJstMonthKey(nowMs);
    const monthTtl = toMonthTtlSeconds(nowMs);

    const ip = input.tier === 'anonymous' ? input.ip : undefined;
    // 月の上限で断る申し込みでは塩を作らないよう、IP の入力は月の回数が通ったあとに作る
    const tryKind = (kind: UsageKind) =>
      this.repository.tryConsumeWithIp({
        monthly: {
          subject: input.subject,
          month,
          kind,
          limit: kind === 'ai' ? aiPerMonth : noAiPerMonth,
          ttlSec: monthTtl,
        },
        ip: ip ? (): Promise<IpCountInput> => this.buildIpCountInput(ip, nowMs) : undefined,
        // 戻せなければ 1 回分を多く数えたままになるが、元の結果の扱いを優先して握り、報告にとどめる
        onRollbackError: (error) => this.reportError(ROLLBACK_FAILED_MESSAGE, error),
      });

    let kind: UsageKind;
    if (input.aiAnalysis === false) {
      const result = await tryKind('noAi');
      if (!result.ok) {
        return {
          ok: false,
          code: result.denied === 'ip' ? 'IP_LIMIT_EXCEEDED' : 'NO_AI_LIMIT_EXCEEDED',
        };
      }
      kind = 'noAi';
    } else {
      const aiResult = await tryKind('ai');
      if (aiResult.ok) {
        kind = 'ai';
      } else if (aiResult.denied === 'ip') {
        return { ok: false, code: 'IP_LIMIT_EXCEEDED' };
      } else if (input.aiAnalysis === true) {
        return { ok: false, code: 'AI_LIMIT_EXCEEDED' };
      } else {
        const noAiResult = await tryKind('noAi');
        if (!noAiResult.ok) {
          return {
            ok: false,
            code: noAiResult.denied === 'ip' ? 'IP_LIMIT_EXCEEDED' : 'NO_AI_LIMIT_EXCEEDED',
          };
        }
        kind = 'noAi';
      }
    }

    const record: UsageRecord = {
      subject: input.subject,
      month,
      kind,
      noAiLimit: noAiPerMonth,
    };

    return { ok: true, record, aiAnalysis: kind === 'ai', limit };
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

  /**
   * ジョブに記録された 1 回を戻す。記録が無いジョブでは何もしない。
   *
   * ジョブの戻し済みの印を条件付きで付けられた呼び出しだけが戻すため、Batch の再試行や
   * web との重なりがあっても同じ 1 回を二重に戻さない。
   * 印を先に付けるので、戻す処理の途中で失敗したときは戻し損ねる側に倒れる。
   *
   * @returns 戻したか
   */
  public async releaseForJob(job: Job, jobRepository: JobRepository): Promise<boolean> {
    if (!job.usage) {
      return false;
    }
    if (!(await jobRepository.markUsageReleased(job.jobId))) {
      return false;
    }
    await this.release(job.usage);
    return true;
  }

  /**
   * AI 解析ありで数えたジョブを、AI 解析なしへ付け替える。AI 解析ありのジョブ以外では何もしない。
   *
   * 付け替え済みの印を条件付きで付けられた呼び出しだけが行うため、再試行しても二重に付け替えない。
   * 付け替えた結果はジョブの記録へ反映し、以降の戻しが実際に数えている種類を戻すようにする。
   * AI 解析なしを数えられなかったときは戻すものが無いため、戻し済みの印を付ける。
   */
  public async switchToNoAiForJob(job: Job, jobRepository: JobRepository): Promise<void> {
    if (!job.usage || job.usage.kind !== 'ai') {
      return;
    }
    if (!(await jobRepository.markUsageSwitched(job.jobId))) {
      return;
    }
    const moved = await this.moveToNoAi(job.usage);
    if (moved) {
      await jobRepository.updateUsage(job.jobId, moved);
    } else {
      await jobRepository.markUsageReleased(job.jobId);
    }
  }

  /** 残り回数を返す */
  public async getUsage(subject: string, tier: UsageTier): Promise<UsageSnapshot> {
    const month = toJstMonthKey(this.now());
    const limits = getUsageLimit(tier);
    if (limits.aiPerMonth === null || limits.noAiPerMonth === null) {
      // 数えていないため、カウンターは読まない
      return { month, tier, limits, used: { ai: 0, noAi: 0 }, remaining: { ai: null, noAi: null } };
    }
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

  private async buildIpCountInput(ip: string, nowMs: number): Promise<IpCountInput> {
    const day = toJstDayKey(nowMs);
    const dayTtl = toDayTtlSeconds(nowMs);
    const salt = await this.repository.getOrCreateDailySalt(day, this.generateSalt(), dayTtl);
    // IP をそのまま保存しないため、日ごとの塩を鍵にした HMAC にする
    const ipHash = createHmac('sha256', salt).update(ip).digest('hex');
    return { day, ipHash, limit: IP_DAILY_JOB_LIMIT, ttlSec: dayTtl };
  }
}
