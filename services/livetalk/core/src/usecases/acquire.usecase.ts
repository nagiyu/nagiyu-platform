import { logger, toErrorMessage } from '@nagiyu/common';
import type { CharacterDefinition } from '../characters/types.js';
import {
  ACQUIRE_MAX_QUERIES_PER_RUN,
  ACQUIRE_SELF_STUDY_CANDIDATE_LIMIT,
  ACQUIRE_SELF_STUDY_COOLDOWN_MS,
  ACQUIRE_STALE_SWEEP_LIMIT,
  STUDY_INACTIVE_WINDOW_HOURS,
  WEBFACT_REVIEW_INTERVAL_MS,
} from '../constants.js';
import type { LifecycleEntity } from '../entities/lifecycle.entity.js';
import type { WebFactEntity } from '../entities/web-fact.entity.js';
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
  /**
   * 鮮度切れ再取得で実行した research 回数（トピック単位。変化の有無を問わない）。
   * 1 トピックに複数の期限切れ WEB fact があっても research は 1 回にまとめるため、
   * 期限切れ fact の件数とは一致しない（fact 件数は `staleFactsReviewed` を参照）。
   * トピック欠落（getTopic が null）のフォールバック時のみ fact 単位で 1 回とカウントする。
   */
  staleRefreshed: number;
  /** 鮮度切れ再取得のうち、変化ありと判定され WEBRAW を書いた回数 */
  staleChanged: number;
  /**
   * 鮮度切れ再取得で NextReview を前方更新した WEB fact の総数。
   * トピックにまとめて 1 回 research した場合でも、対象となった期限切れ fact 全部
   * （GSI-STALE の窓で拾った分に限らない、そのトピックの期限切れ fact 全部）を数える。
   */
  staleFactsReviewed: number;
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
 * Topic の Subject から「〜最新情報」形式のリサーチクエリを組み立てる。
 *
 * Subject の末尾（前後空白を除いた上で）が既に「最新情報」で終わっている場合は
 * 付け足さない（例: Subject が「〇〇の最新情報」だと「〇〇の最新情報 最新情報」という
 * 二重付与クエリになってしまうバグの修正）。鮮度切れ再取得・care 自発リサーチの
 * 両方のクエリ生成で共通して使う。
 */
export function buildLatestInfoQuery(subject: string): string {
  const trimmed = subject.trim();
  if (trimmed.endsWith('最新情報')) {
    return trimmed;
  }
  return `${trimmed} 最新情報`;
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
 * 鮮度切れ再取得は **トピック単位に集約**して research する（#3781）。GSI-STALE を
 * `ACQUIRE_STALE_SWEEP_LIMIT` 件まで読み、取り出した期限切れ WEB fact を TopicID で束ね、
 * 窓の並び順（NextReview が古い順）でトピックを処理する。1 トピックに数十〜百件の
 * fact が付くケースがあり、fact 単位で research すると同一トピックへ同じクエリを
 * 何度も発行してしまうため、**research はトピックにつき 1 回**（= budget 1 消費）とし、
 * そのトピックの期限切れ fact 全部（窓で拾えなかった分も `listWebFacts` で取り直して含める）
 * の `NextReview` をまとめて前方更新する。トピックが既に存在しない場合（`getTopic` が null）
 * は束ねられないため、従来どおり fact 単位で `fact.Text` をクエリにして処理する。
 *
 * 鮮度切れ再取得は、変化検知（`changeDetector`）で「変化があった時だけ」WEBRAW を書く
 * （陳腐な再要約を止める）。変化の有無に関わらず対象 fact 全部の `NextReview` は前方更新し、
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
      staleFactsReviewed: 0,
      selfStudied: 0,
      webRawWritten: 0,
    };
  }

  let budget = maxQueriesPerRun;
  let requestsProcessed = 0;
  let staleRefreshed = 0;
  let staleChanged = 0;
  let staleFactsReviewed = 0;
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
          Origin: 'request',
          RequestText: studyTopic.Topic,
          RequestedAt: studyTopic.CreatedAt,
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
          '[acquire] 依頼（StudyTopic）のリサーチに失敗しました（pending へ戻して次回再試行）',
          {
            userId,
            characterId,
            topic: studyTopic.Topic,
            err: toErrorMessage(err),
          }
        );
        // 失敗時は pending へ戻す。in_progress のまま残すと listByStatus('pending') に
        // 二度と拾われず（findPendingByTopic も係属中とみなす）、ユーザーの依頼が
        // 沈黙のうちに失われるため、確実に次回バッチで再試行できるようにする。
        try {
          await studyTopicRepo.updateStatus({
            UserID: userId,
            CharacterID: characterId,
            TopicID: studyTopic.TopicID,
            Status: 'pending',
            Priority: studyTopic.Priority,
          });
        } catch (revertErr) {
          logger.warn('[acquire] 依頼（StudyTopic）の pending 復帰に失敗しました', {
            userId,
            characterId,
            topic: studyTopic.Topic,
            err: toErrorMessage(revertErr),
          });
        }
      }
    }
  }

  // ---- 2. 鮮度切れ（staleness refresh）----
  if (budget > 0) {
    // 読み込みは budget と無関係に ACQUIRE_STALE_SWEEP_LIMIT 件まで読む。1 トピックに
    // 複数の期限切れ fact が付くため、budget 件しか読まないとトピック単位に集約できない
    // （budget=3 でも同一トピックの fact が 3 件読めれば research は本来 1 回で済む）。
    const staleFacts = await topicRepo.listStaleWebFacts(
      userId,
      characterId,
      nowMs,
      ACQUIRE_STALE_SWEEP_LIMIT
    );

    // TopicID で束ねる。窓の並び順（NextReview が古い順）における各トピックの初出順を
    // トピックの処理順とする。
    const topicIdOrder: string[] = [];
    const windowFactsByTopicId = new Map<string, WebFactEntity[]>();
    for (const fact of staleFacts) {
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
      if (!windowFactsByTopicId.has(fact.TopicID)) {
        topicIdOrder.push(fact.TopicID);
        windowFactsByTopicId.set(fact.TopicID, []);
      }
      windowFactsByTopicId.get(fact.TopicID)?.push(fact);
    }

    for (const topicId of topicIdOrder) {
      if (budget <= 0) break;

      const windowFacts = windowFactsByTopicId.get(topicId);
      if (!windowFacts || windowFacts.length === 0) continue;

      const topic = await topicRepo.getTopic({ userId, characterId, topicId });

      if (!topic) {
        // トピック欠落: 束ねられないため従来どおり fact 単位で処理する（フォールバック）。
        for (const fact of windowFacts) {
          if (budget <= 0) break;

          try {
            const query = fact.Text;
            const result = await researchClient.research(query, character);
            const changed = await changeDetector.hasChanged(fact.Text, result);

            if (changed) {
              await webRawRepo.put({
                UserID: userId,
                CharacterID: characterId,
                Query: query,
                RawText: result.summary,
                SourceUrls: result.sourceUrls,
                Origin: 'stale',
              });
              webRawWritten++;
              staleChanged++;
            }

            // 変化の有無に関わらず NextReview を前方更新し、次回掃引の窓から外す
            // （毎時再掃引の無限ループを防ぐ）。
            await topicRepo.updateWebFactNextReview(
              { userId, characterId, topicId: fact.TopicID, factId: fact.FactID },
              computeNextReview(fact.Volatility as 'low' | 'medium' | 'high', nowMs)
            );
            staleFactsReviewed++;

            staleRefreshed++;
            budget--;
          } catch (err) {
            logger.warn(
              '[acquire] 鮮度切れ WEB fact の再取得に失敗しました（NextReview を前進させて次回に委ねる）',
              {
                userId,
                characterId,
                topicId: fact.TopicID,
                factId: fact.FactID,
                err: toErrorMessage(err),
              }
            );
            // 失敗しても research を試行した以上は budget を消費する（GSI-STALE は budget と
            // 無関係に読むため、消費しないと障害時に 1 実行で窓の件数ぶん research が走る）。
            budget--;
            // research が特定 fact で失敗し続けると、NextReview が前進せず毎時「最古」として
            // 窓の先頭に居座り budget を占有し続ける（poison pill による starvation）。
            // 失敗時も best-effort で NextReview を前進させ、掃引窓から外す
            // （stable は上部で除外済みのため、ここは常に low/medium/high）。
            try {
              await topicRepo.updateWebFactNextReview(
                { userId, characterId, topicId: fact.TopicID, factId: fact.FactID },
                computeNextReview(fact.Volatility as 'low' | 'medium' | 'high', nowMs)
              );
              staleFactsReviewed++;
            } catch (bumpErr) {
              logger.warn('[acquire] 鮮度切れ fact の NextReview 前進に失敗しました', {
                userId,
                characterId,
                topicId: fact.TopicID,
                factId: fact.FactID,
                err: toErrorMessage(bumpErr),
              });
            }
          }
        }
        continue;
      }

      // トピックが存在する場合、そのトピックの期限切れ WEB fact 全部（窓で拾った分に
      // 限らない。GSI-STALE の limit で切り落とされた分も listWebFacts で取り直して含める）
      // をまとめて 1 回の research で処理する。
      let targetFacts: WebFactEntity[];
      try {
        const webFacts = await topicRepo.listWebFacts(userId, characterId, topicId);
        targetFacts = webFacts.filter(
          (f) => f.Volatility !== 'stable' && f.NextReview !== undefined && f.NextReview <= nowMs
        );
      } catch (err) {
        logger.warn(
          '[acquire] 鮮度切れトピックの WEB fact 一覧取得に失敗しました（このトピックをスキップ）',
          { userId, characterId, topicId, err: toErrorMessage(err) }
        );
        continue;
      }

      if (targetFacts.length === 0) {
        // 窓には出たが listWebFacts では既に対象外（他プロセスが先に前進させた等）。
        continue;
      }

      const query = buildLatestInfoQuery(topic.Subject);
      // 変化検知の existingText は対象 fact 全部の Text を改行区切りで連結する
      // （インターフェース `hasChanged(existingText, fresh)` は変更しない）。
      const existingText = targetFacts.map((f) => f.Text).join('\n');

      const bumpAllNextReview = async (): Promise<void> => {
        for (const fact of targetFacts) {
          try {
            await topicRepo.updateWebFactNextReview(
              { userId, characterId, topicId: fact.TopicID, factId: fact.FactID },
              computeNextReview(fact.Volatility as 'low' | 'medium' | 'high', nowMs)
            );
            staleFactsReviewed++;
          } catch (bumpErr) {
            logger.warn('[acquire] 鮮度切れ fact の NextReview 前進に失敗しました', {
              userId,
              characterId,
              topicId: fact.TopicID,
              factId: fact.FactID,
              err: toErrorMessage(bumpErr),
            });
          }
        }
      };

      try {
        const result = await researchClient.research(query, character);
        const changed = await changeDetector.hasChanged(existingText, result);

        if (changed) {
          await webRawRepo.put({
            UserID: userId,
            CharacterID: characterId,
            Query: query,
            RawText: result.summary,
            SourceUrls: result.sourceUrls,
            Origin: 'stale',
          });
          webRawWritten++;
          staleChanged++;
        }

        // 変化の有無に関わらず対象 fact 全部の NextReview を前方更新し、次回掃引の窓から
        // 外す（毎時再掃引の無限ループを防ぐ）。
        await bumpAllNextReview();

        staleRefreshed++;
        budget--;
      } catch (err) {
        logger.warn(
          '[acquire] 鮮度切れ WEB fact の再取得に失敗しました（対象 fact 全部の NextReview を前進させて次回に委ねる）',
          {
            userId,
            characterId,
            topicId,
            factCount: targetFacts.length,
            err: toErrorMessage(err),
          }
        );
        // 失敗しても research を試行した以上は budget を消費する（GSI-STALE は budget と
        // 無関係に読むため、消費しないと障害時に 1 実行でトピック数ぶん research が走る）。
        budget--;
        // research/検知/書き込みのいずれかで失敗しても、poison pill による budget
        // starvation を防ぐため対象 fact 全部を best-effort で前進させる。
        await bumpAllNextReview();
      }
    }
  }

  // ---- 3. care 自発リサーチ ----
  // budget より広めに候補を取り、クールダウン中（直近取得済み）の Topic を読み飛ばして
  // 未研究・古い Topic に budget を割り当てる（冗長な WEB fact の線形増加を防ぐ）。
  if (budget > 0 && !decision.skipSelfStudy) {
    const headers = await topicRepo.listTopicHeadersByCareDesc(
      userId,
      characterId,
      ACQUIRE_SELF_STUDY_CANDIDATE_LIMIT
    );

    for (const header of headers) {
      if (budget <= 0) break;

      // クールダウン判定: 直近この Topic を取得済み（最新 WEB fact の ObservedAt が
      // now - ACQUIRE_SELF_STUDY_COOLDOWN_MS 以降）なら自発リサーチをスキップする。
      // 揮発 fact の鮮度追随は GSI-STALE 経路が別途担うため、ここでは穴埋めに限定する。
      try {
        const webFacts = await topicRepo.listWebFacts(userId, characterId, header.TopicID);
        const latestObservedAt = webFacts.reduce((max, f) => Math.max(max, f.ObservedAt), 0);
        if (latestObservedAt > 0 && nowMs - latestObservedAt < ACQUIRE_SELF_STUDY_COOLDOWN_MS) {
          continue;
        }
      } catch (err) {
        // クールダウン判定の読み取り失敗は握って研究続行（取りこぼしより再取得を優先）
        logger.warn('[acquire] care 自発リサーチのクールダウン判定に失敗しました（続行）', {
          userId,
          characterId,
          topicId: header.TopicID,
          err: toErrorMessage(err),
        });
      }

      try {
        const query = buildLatestInfoQuery(header.Subject);
        const result = await researchClient.research(query, character);

        await webRawRepo.put({
          UserID: userId,
          CharacterID: characterId,
          Query: query,
          RawText: result.summary,
          SourceUrls: result.sourceUrls,
          Origin: 'auto',
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
    staleFactsReviewed,
    selfStudied,
    webRawWritten,
  };
}
