import { logger, toErrorMessage } from '@nagiyu/common';
import type { CharacterDefinition } from '../characters/types.js';
import {
  ACQUIRE_MAX_QUERIES_PER_RUN,
  ACQUIRE_STALE_SWEEP_LIMIT,
  STUDY_INACTIVE_WINDOW_HOURS,
  WEBFACT_REVIEW_INTERVAL_MS,
} from '../constants.js';
import type { LifecycleEntity } from '../entities/lifecycle.entity.js';
import type { TopicRepository } from '../repositories/topic.repository.interface.js';
import type { WebRawRepository } from '../repositories/webraw.repository.interface.js';
import type { StudyTopicRepository } from '../repositories/study-topic.repository.interface.js';
import { resolveLifecycleState } from '../lifecycle/state-resolver.js';
import type { IResearchClient } from '../research/types.js';
import type { IWebFactChangeDetector } from '../research/web-fact-change-detector.js';
import type { UlidFactory } from '../lib/ulid.js';

export interface AcquireForUserParams {
  topicRepo: TopicRepository;
  webRawRepo: WebRawRepository;
  studyTopicRepo: StudyTopicRepository;
  researchClient: IResearchClient;
  changeDetector: IWebFactChangeDetector;
  character: CharacterDefinition;
  lifecycle: LifecycleEntity;
  /** テスト用途の ULID 差し替え（acquire 自体は ID を採番しないため現状未使用） */
  ulidFactory?: UlidFactory;
  now?: () => Date;
  maxQueriesPerRun?: number;
}

export interface AcquireForUserResult {
  outcome: 'acquired' | 'skipped';
  skipReason?: string;
  /** 依頼（StudyTopic pending）を処理した件数 */
  requestsProcessed: number;
  /** 鮮度切れ WEB fact を再取得した件数（変化の有無を問わない） */
  staleRefreshed: number;
  /** 鮮度切れ再取得のうち、変化ありと判定され WEBRAW を書いた件数 */
  staleChanged: number;
  /** care 降順の自発リサーチを行った件数 */
  selfStudied: number;
  /** WEBRAW を書き込んだ総件数 */
  webRawWritten: number;
}

interface ShouldAcquireDecision {
  /** キャラが起床中か。false ならこの回は全スキップする。 */
  awake: boolean;
  /** true の場合、care 自発リサーチのみスキップする（依頼・鮮度切れは実施） */
  skipSelfStudy: boolean;
  reason?: string;
}

/**
 * acquire バッチの実施判定。
 *
 * - キャラが就寝中なら全スキップ（Web 活動をしない）。
 * - 起床中でもユーザーのピーク活動時間帯は、自発 care リサーチのみスキップする
 *   （依頼・鮮度切れの再取得はユーザー起点/期限起点のため awake なら実施する）。
 */
export function shouldAcquireNow(lifecycle: LifecycleEntity, now: Date): ShouldAcquireDecision {
  const state = resolveLifecycleState(now, lifecycle.Bedtime, lifecycle.WakeUpTime);
  if (state !== 'awake') {
    return { awake: false, skipSelfStudy: true, reason: 'キャラが就寝中' };
  }

  const profile = lifecycle.UserActivityProfile;
  if (profile) {
    const currentHour = now.getHours();
    if (
      isNearPeak(currentHour, profile.morningPeak) ||
      isNearPeak(currentHour, profile.eveningPeak)
    ) {
      return {
        awake: true,
        skipSelfStudy: true,
        reason: 'ユーザーのピーク活動時間帯のため care 自発リサーチをスキップ',
      };
    }
  }

  return { awake: true, skipSelfStudy: false };
}

function isNearPeak(currentHour: number, peakTime: string): boolean {
  const peakHour = parseInt(peakTime.split(':')[0], 10);
  const diff = Math.abs(currentHour - peakHour);
  const circularDiff = Math.min(diff, 24 - diff);
  return circularDiff <= STUDY_INACTIVE_WINDOW_HOURS;
}

/**
 * 揮発性区分から次回再検証予定時刻（NextReview）を計算する。
 * `consolidate.usecase.ts` の同名ロジックと同じ計算式（stable はここに来ない想定だが、
 * 防御的に `WEBFACT_REVIEW_INTERVAL_MS` に存在しない区分は現在時刻＋既定の低頻度間隔にフォールバックしない
 * ようフォールバック不要な呼び出し側でガードする）。
 */
function computeNextReview(volatility: 'low' | 'medium' | 'high', readAt: number): number {
  return readAt + WEBFACT_REVIEW_INTERVAL_MS[volatility];
}

/**
 * 1 ユーザー × 1 キャラの acquire バッチ（Web「取得だけ」）
 * （リブトーク知識再設計 P3 / #3699）。
 *
 * 既存の `study`（Phase 5a）を「取得だけ」に縮小した新バッチ。3 種の対象を Web 取得し
 * WEBRAW を書く（Topic への畳み込みは既存 consolidation に一切委ねる）。
 *
 * 処理順は 依頼（StudyTopic pending）→ 鮮度切れ（GSI-STALE 窓走査）→ care 自発リサーチ。
 * `maxQueriesPerRun`（既定 `ACQUIRE_MAX_QUERIES_PER_RUN`）を 3 ソース合算で消費する。
 *
 * 鮮度切れ再取得は、変化検知（`changeDetector`）で「変化があった時だけ」WEBRAW を書く
 * （陳腐な再要約を止める）。変化の有無に関わらず `NextReview` は前方更新し、
 * 掃引窓（GSI-STALE）から外す（毎時再掃引の無限ループを防ぐ）。
 *
 * 個々の Web 取得失敗は fail-warn（握って継続）。run 全体は落とさない。
 */
export async function acquireForUser(
  userId: string,
  characterId: string,
  params: AcquireForUserParams
): Promise<AcquireForUserResult> {
  const {
    topicRepo,
    webRawRepo,
    studyTopicRepo,
    researchClient,
    changeDetector,
    character,
    lifecycle,
    now = () => new Date(),
    maxQueriesPerRun = ACQUIRE_MAX_QUERIES_PER_RUN,
  } = params;

  const nowDate = now();
  const nowMs = nowDate.getTime();

  const decision = shouldAcquireNow(lifecycle, nowDate);
  if (!decision.awake) {
    return {
      outcome: 'skipped',
      skipReason: decision.reason,
      requestsProcessed: 0,
      staleRefreshed: 0,
      staleChanged: 0,
      selfStudied: 0,
      webRawWritten: 0,
    };
  }

  let budget = maxQueriesPerRun;
  let requestsProcessed = 0;
  let staleRefreshed = 0;
  let staleChanged = 0;
  let selfStudied = 0;
  let webRawWritten = 0;

  // ---- 1. 依頼（StudyTopic pending）を消費 ----
  if (budget > 0) {
    const pendingTopics = await studyTopicRepo.listByStatus(userId, characterId, 'pending');

    for (const studyTopic of pendingTopics) {
      if (budget <= 0) break;

      try {
        await studyTopicRepo.updateStatus({
          UserID: userId,
          CharacterID: characterId,
          TopicID: studyTopic.TopicID,
          Status: 'in_progress',
          Priority: studyTopic.Priority,
        });

        const result = await researchClient.research(studyTopic.Topic, character);

        await webRawRepo.put({
          UserID: userId,
          CharacterID: characterId,
          Query: studyTopic.Topic,
          RawText: result.summary,
          SourceUrls: result.sourceUrls,
        });
        webRawWritten++;

        await studyTopicRepo.updateStatus({
          UserID: userId,
          CharacterID: characterId,
          TopicID: studyTopic.TopicID,
          Status: 'done',
          Priority: studyTopic.Priority,
        });

        requestsProcessed++;
        budget--;
      } catch (err) {
        logger.warn(
          '[acquire] 依頼（StudyTopic）のリサーチに失敗しました（in_progress のまま次回再試行）',
          {
            userId,
            characterId,
            topic: studyTopic.Topic,
            err: toErrorMessage(err),
          }
        );
        // in_progress のまま次回バッチで再試行する（既存 study と同じ作法）
      }
    }
  }

  // ---- 2. 鮮度切れ（staleness refresh）----
  if (budget > 0) {
    const staleFacts = await topicRepo.listStaleWebFacts(
      userId,
      characterId,
      nowMs,
      ACQUIRE_STALE_SWEEP_LIMIT
    );

    for (const fact of staleFacts) {
      if (budget <= 0) break;

      if (fact.Volatility === 'stable') {
        // stable fact は NextReview を持たないため GSI4 に現れないはずだが、念のため防御的にスキップ
        logger.warn('[acquire] stable fact が鮮度掃引の対象に含まれていました（スキップ）', {
          userId,
          characterId,
          topicId: fact.TopicID,
          factId: fact.FactID,
        });
        continue;
      }

      try {
        const topic = await topicRepo.getTopic({
          userId,
          characterId,
          topicId: fact.TopicID,
        });
        const query = topic ? `${topic.Subject} 最新情報` : fact.Text;

        const result = await researchClient.research(query, character);
        const changed = await changeDetector.hasChanged(fact.Text, result);

        if (changed) {
          await webRawRepo.put({
            UserID: userId,
            CharacterID: characterId,
            Query: query,
            RawText: result.summary,
            SourceUrls: result.sourceUrls,
          });
          webRawWritten++;
          staleChanged++;
        }

        // 変化の有無に関わらず NextReview を前方更新し、次回掃引の窓から外す
        // （毎時再掃引の無限ループを防ぐ）。
        await topicRepo.updateWebFactNextReview(
          { userId, characterId, topicId: fact.TopicID, factId: fact.FactID },
          computeNextReview(fact.Volatility, nowMs)
        );

        staleRefreshed++;
        budget--;
      } catch (err) {
        logger.warn('[acquire] 鮮度切れ WEB fact の再取得に失敗しました（スキップして継続）', {
          userId,
          characterId,
          topicId: fact.TopicID,
          factId: fact.FactID,
          err: toErrorMessage(err),
        });
      }
    }
  }

  // ---- 3. care 自発リサーチ ----
  if (budget > 0 && !decision.skipSelfStudy) {
    const headers = await topicRepo.listTopicHeadersByCareDesc(userId, characterId, budget);

    for (const header of headers) {
      if (budget <= 0) break;

      try {
        const query = `${header.Subject} 最新情報`;
        const result = await researchClient.research(query, character);

        await webRawRepo.put({
          UserID: userId,
          CharacterID: characterId,
          Query: query,
          RawText: result.summary,
          SourceUrls: result.sourceUrls,
        });
        webRawWritten++;
        selfStudied++;
        budget--;
      } catch (err) {
        logger.warn('[acquire] care 自発リサーチに失敗しました（スキップして継続）', {
          userId,
          characterId,
          topicId: header.TopicID,
          subject: header.Subject,
          err: toErrorMessage(err),
        });
      }
    }
  }

  return {
    outcome: 'acquired',
    requestsProcessed,
    staleRefreshed,
    staleChanged,
    selfStudied,
    webRawWritten,
  };
}
