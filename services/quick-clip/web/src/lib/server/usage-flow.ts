import {
  createJobRepository,
  getUsageLimit,
  USAGE_DENY_MESSAGES,
  type Job,
  type UsageDenyCode,
  type UsageLimit,
  type UsageRecord,
} from '@nagiyu/quick-clip-core';
import { errorReporter } from '@/lib/api-error-reporting';
import { createUsageService, type UsageContext } from '@/lib/server/usage-context';

const ERROR_MESSAGES = {
  USAGE_CHECK_BYPASSED: 'Web API: 利用回数の確認エラー (バイパス)',
  USAGE_RELEASE_FAILED: 'Web API: 利用回数を戻せませんでした',
} as const;

/** 上限超過のうち、利用者の申告 (動画の長さ) が原因のものは 400、回数・IP の上限は 429 */
const DENY_STATUS: Readonly<Record<UsageDenyCode, number>> = {
  AI_LIMIT_EXCEEDED: 429,
  NO_AI_LIMIT_EXCEEDED: 429,
  IP_LIMIT_EXCEEDED: 429,
  DURATION_LIMIT_EXCEEDED: 400,
};

export type UsageDenial = {
  code: UsageDenyCode;
  message: string;
  status: number;
};

export type UsageReservation = {
  /** 数えた 1 回の記録。数えられなかったとき (記録先の障害で通した場合) は無い */
  record?: UsageRecord;
  /** この申し込みで AI 解析を行うか */
  aiAnalysis: boolean;
  limit: UsageLimit;
  /** 断るとき。あればジョブを作ってはならない */
  denial?: UsageDenial;
};

export type ReserveUsageInput = {
  /** AI 解析の希望。省略時は AI ありを試し、残りが無ければ AI なしで受ける */
  aiAnalysis?: boolean;
  /** ブラウザが申告した動画の長さ (秒) */
  durationSec?: number;
  /** 接続元の IP。未ログインのときだけ使う */
  ip?: string;
};

/**
 * ジョブ 1 回分を数える。上限に達していれば断る理由を返す。
 *
 * 記録先の障害で数えられないときは、報告して通す (フェイルオープン)。
 * このとき記録は無く、AI 解析は行わない。記録が使えない状態で AI の費用を出さないため。
 */
export const reserveUsage = async (
  context: UsageContext,
  input: ReserveUsageInput
): Promise<UsageReservation> => {
  const limit = getUsageLimit(context.tier);
  try {
    const consumed = await createUsageService().consume({
      subject: context.subject,
      tier: context.tier,
      aiAnalysis: input.aiAnalysis,
      durationSec: input.durationSec,
      ip: context.tier === 'anonymous' ? input.ip : undefined,
    });
    if (!consumed.ok) {
      return {
        aiAnalysis: false,
        limit,
        denial: {
          code: consumed.code,
          message: USAGE_DENY_MESSAGES[consumed.code],
          status: DENY_STATUS[consumed.code],
        },
      };
    }
    return {
      record: consumed.record,
      aiAnalysis: consumed.record.kind === 'ai',
      limit,
    };
  } catch (error) {
    console.warn('[reserveUsage] 利用回数を数えられなかったため通しました。', error);
    await errorReporter.report(ERROR_MESSAGES.USAGE_CHECK_BYPASSED, error);
    return { aiAnalysis: false, limit };
  }
};

/**
 * ジョブを作る前の失敗で、数えた 1 回を戻す。ジョブが無いため、ジョブの印を介さずに戻す。
 * 戻せなくても元の失敗を妨げず、warning で報告する。
 */
export const releaseUsageBeforeJob = async (record: UsageRecord | undefined): Promise<void> => {
  if (!record) {
    return;
  }
  try {
    await createUsageService().release(record);
  } catch (error) {
    await errorReporter.report(ERROR_MESSAGES.USAGE_RELEASE_FAILED, error, {
      severity: 'warning',
    });
  }
};

/**
 * ジョブができた後の失敗で、数えた 1 回を戻す。ジョブができた後の戻しはすべてここを通す。
 *
 * ジョブの戻し済みの印を先に付けられた側だけが戻すため、Batch の戻しと重なっても二重に戻らない。
 * 戻せなくても元の失敗を妨げず、warning で報告する。
 */
export const releaseUsageForJob = async (job: Job): Promise<void> => {
  try {
    await createUsageService().releaseForJob(job, createJobRepository());
  } catch (error) {
    await errorReporter.report(ERROR_MESSAGES.USAGE_RELEASE_FAILED, error, {
      severity: 'warning',
      context: { jobId: job.jobId },
    });
  }
};

/**
 * アップロードをやめたジョブの 1 回を戻す。Batch に投入済みのジョブは処理が進むため戻さない。
 */
export const releaseUsageForAbortedJob = async (jobId: string): Promise<void> => {
  try {
    const job = await createJobRepository().getById(jobId);
    if (!job || job.batchJobId !== undefined) {
      return;
    }
    await releaseUsageForJob(job);
  } catch (error) {
    await errorReporter.report(ERROR_MESSAGES.USAGE_RELEASE_FAILED, error, {
      severity: 'warning',
      context: { jobId },
    });
  }
};
