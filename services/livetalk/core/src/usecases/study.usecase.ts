import { logger } from '@nagiyu/common';
import type { CharacterDefinition } from '../characters/types.js';
import {
  STUDY_MAX_QUERIES_PER_RUN,
  STUDY_MIN_INTERVAL_HOURS,
  STUDY_INACTIVE_WINDOW_HOURS,
  STUDY_MIN_SUMMARY_LENGTH,
} from '../constants.js';
import type { LifecycleEntity } from '../entities/lifecycle.entity.js';
import type { KnowledgeRepository } from '../repositories/knowledge.repository.interface.js';
import type { InterestRepository } from '../repositories/interest.repository.interface.js';
import { resolveLifecycleState } from '../lifecycle/state-resolver.js';
import type { IResearchClient } from '../research/types.js';
import type { UlidFactory } from '../lib/ulid.js';
import { defaultUlidFactory } from '../lib/ulid.js';

export interface StudyForUserParams {
  knowledgeRepo: KnowledgeRepository;
  interestRepo: InterestRepository;
  researchClient: IResearchClient;
  character: CharacterDefinition;
  lifecycle: LifecycleEntity;
  ulidFactory?: UlidFactory;
  now?: () => Date;
  maxQueriesPerRun?: number;
}

export interface StudyForUserResult {
  outcome: 'studied' | 'skipped';
  skipReason?: string;
  savedCount?: number;
}

/**
 * 1 ユーザー × 1 キャラの勉強バッチ（Web リサーチ → 知識ベース保存）。
 *
 * 実施判定：
 * 1. キャラが起床中（lifecycle の Bedtime/WakeUpTime）
 * 2. ユーザーが非活動時間帯（activityProfile のピーク前後 STUDY_INACTIVE_WINDOW_HOURS を避ける）
 * 3. 前回勉強から STUDY_MIN_INTERVAL_HOURS 以上経過
 */
export async function studyForUser(
  userId: string,
  characterId: string,
  params: StudyForUserParams
): Promise<StudyForUserResult> {
  const {
    knowledgeRepo,
    interestRepo,
    researchClient,
    character,
    lifecycle,
    ulidFactory = defaultUlidFactory,
    now = () => new Date(),
    maxQueriesPerRun = STUDY_MAX_QUERIES_PER_RUN,
  } = params;

  const nowDate = now();

  // 前回勉強時刻を取得
  const latestKnowledge = await knowledgeRepo.getLatest(userId, characterId);
  const lastStudiedAt = latestKnowledge?.CreatedAt;

  const shouldStudy = shouldStudyNow(lifecycle, lastStudiedAt, nowDate);
  if (!shouldStudy.result) {
    return { outcome: 'skipped', skipReason: shouldStudy.reason };
  }

  let savedCount = 0;

  // 興味カテゴリ処理（StudyTopic pending の消費は acquire バッチ（P3 / #3699）に移管した）
  const remainingQuota = maxQueriesPerRun - savedCount;
  if (remainingQuota > 0) {
    const categories = await interestRepo.list(userId, characterId);
    if (categories.length === 0 && savedCount === 0) {
      return { outcome: 'skipped', skipReason: '興味カテゴリが未登録' };
    }

    const sorted = [...categories].sort((a, b) => b.Weight - a.Weight);
    const targets = sorted.slice(0, remainingQuota);

    for (const cat of targets) {
      const query = buildSearchQuery(cat.Category);
      try {
        const result = await researchClient.research(query, character);

        if (result.summary.length < STUDY_MIN_SUMMARY_LENGTH) {
          logger.warn('[study] 品質が低いため保存をスキップ', {
            userId,
            characterId,
            category: cat.Category,
            summaryLength: result.summary.length,
          });
          continue;
        }

        await knowledgeRepo.put({
          UserID: userId,
          CharacterID: characterId,
          KnowledgeID: ulidFactory(),
          Topic: result.topic,
          Summary: result.summary,
          SourceUrls: result.sourceUrls,
          RawComment: result.rawComment,
          RelatedCategory: cat.Category,
        });
        savedCount++;
      } catch (err) {
        logger.warn('[study] リサーチ失敗', {
          userId,
          characterId,
          category: cat.Category,
          err,
        });
      }
    }
  }

  return { outcome: 'studied', savedCount };
}

function buildSearchQuery(category: string): string {
  return `${category} 最新情報`;
}

interface ShouldStudyDecision {
  result: boolean;
  reason?: string;
}

export function shouldStudyNow(
  lifecycle: LifecycleEntity,
  lastStudiedAt: number | undefined,
  now: Date
): ShouldStudyDecision {
  // 1. キャラが起床中か
  const state = resolveLifecycleState(now, lifecycle.Bedtime, lifecycle.WakeUpTime);
  if (state !== 'awake') {
    return { result: false, reason: 'キャラが就寝中' };
  }

  // 2. ユーザーのピーク活動時間帯を避ける
  const profile = lifecycle.UserActivityProfile;
  if (profile) {
    const currentHour = now.getHours();
    if (
      isNearPeak(currentHour, profile.morningPeak) ||
      isNearPeak(currentHour, profile.eveningPeak)
    ) {
      return { result: false, reason: 'ユーザーのピーク活動時間帯' };
    }
  }

  // 3. 前回勉強からの経過時間
  if (lastStudiedAt !== undefined) {
    const hoursSince = (now.getTime() - lastStudiedAt) / (1000 * 60 * 60);
    if (hoursSince < STUDY_MIN_INTERVAL_HOURS) {
      return { result: false, reason: `前回勉強から ${STUDY_MIN_INTERVAL_HOURS} 時間未満` };
    }
  }

  return { result: true };
}

function isNearPeak(currentHour: number, peakTime: string): boolean {
  const peakHour = parseInt(peakTime.split(':')[0], 10);
  const diff = Math.abs(currentHour - peakHour);
  const circularDiff = Math.min(diff, 24 - diff);
  return circularDiff <= STUDY_INACTIVE_WINDOW_HOURS;
}
