import { EntityNotFoundError } from '@nagiyu/aws';
import { logger, toErrorMessage } from '@nagiyu/common';
import type { CharacterDefinition } from '../characters/types.js';
import {
  ACQUIRE_MAX_QUERIES_PER_RUN,
  ACQUIRE_SELF_STUDY_CANDIDATE_LIMIT,
  ACQUIRE_SELF_STUDY_COOLDOWN_MS,
  STUDY_INACTIVE_WINDOW_HOURS,
  WEB_FACT_TOPIC_LIMIT,
  WEBFACT_REVIEW_INTERVAL_MS,
} from '../constants.js';
import type { LifecycleEntity } from '../entities/lifecycle.entity.js';
import type { TopicEntity } from '../entities/topic.entity.js';
import type { WebFactEntity } from '../entities/web-fact.entity.js';
import type { TopicRepository } from '../repositories/topic.repository.interface.js';
import type { WebRawRepository } from '../repositories/webraw.repository.interface.js';
import type { FreshnessCheckRequestRepository } from '../repositories/freshness-check-request.repository.interface.js';
import type { StudyTopicRepository } from '../repositories/study-topic.repository.interface.js';
import { resolveLifecycleState } from '../lifecycle/state-resolver.js';
import { selectRecentWebFacts } from '../knowledge/recent-web-facts.js';
import { isStaleWebFact } from '../study/freshness-check.js';
import type { ResearchAllowance } from '../study/research-allowance.js';
import type { IResearchClient } from '../research/types.js';
import type { IWebFactChangeDetector } from '../research/web-fact-change-detector.js';
import type { UlidFactory } from '../lib/ulid.js';

export interface AcquireForUserParams {
  topicRepo: TopicRepository;
  webRawRepo: WebRawRepository;
  studyTopicRepo: StudyTopicRepository;
  /** Topic が使われたときに記録された鮮度確認の依頼 */
  freshnessCheckRequestRepo: FreshnessCheckRequestRepository;
  researchClient: IResearchClient;
  changeDetector: IWebFactChangeDetector;
  character: CharacterDefinition;
  lifecycle: LifecycleEntity;
  /**
   * リサーチを呼ぶ直前に 1 回分を問い合わせる枠。
   * 3 日ルールで止まる組では、呼び出し側がこの関数自体を呼ばない (この関数は止まっているかを判定しない)。
   */
  researchAllowance: ResearchAllowance;
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
   * 鮮度確認の依頼の処理で実行した research 回数 (トピック単位。変化の有無を問わない)。
   * 1 トピックに複数の期限切れ WEB fact があっても research は 1 回にまとめるため、
   * 期限切れ fact の件数とは一致しない（fact 件数は `staleFactsReviewed` を参照）。
   */
  staleRefreshed: number;
  /** 鮮度確認のうち、変化ありと判定され WEBRAW を書いた回数 */
  staleChanged: number;
  /**
   * 鮮度確認の依頼の処理で NextReview を前方更新した WEB fact の総数。
   * トピックにまとめて 1 回 research した場合でも、対象となった期限切れ fact 全部を数える。
   */
  staleFactsReviewed: number;
  /** care 降順の自発リサーチを行った件数 */
  selfStudied: number;
  /** WEBRAW を書き込んだ総件数 */
  webRawWritten: number;
  /** 1 日の上限に達して、以降のリサーチを止めたか */
  dailyLimitReached: boolean;
  /** 回数の記録に失敗して、以降のリサーチを止めたか (止める側に倒す) */
  counterFailed: boolean;
  /**
   * research が実行した Web 検索 tool call の合計回数（search / open_page / find_in_page の全部）。
   * research が例外で終わった呼び出しは回数を取れないため含まれない。
   */
  webSearchCalls: number;
}

interface ShouldAcquireDecision {
  /** キャラが起床中か。false ならこの回は全スキップする。 */
  awake: boolean;
  /** true の場合、care 自発リサーチのみスキップする (依頼・鮮度確認は実施) */
  skipSelfStudy: boolean;
  reason?: string;
}

/**
 * acquire バッチの実施判定。
 *
 * - キャラが就寝中なら全スキップ（Web 活動をしない）。
 * - 起床中でもユーザーのピーク活動時間帯は、自発 care リサーチのみスキップする
 *   (依頼・鮮度確認はユーザーが使った Topic 起点のため awake なら実施する)。
 */
export function shouldAcquireNow(lifecycle: LifecycleEntity, now: Date): ShouldAcquireDecision {
  const state = resolveLifecycleState(now, lifecycle.bedtime, lifecycle.wakeUpTime);
  if (state !== 'awake') {
    return { awake: false, skipSelfStudy: true, reason: 'キャラが就寝中' };
  }

  const profile = lifecycle.userActivityProfile;
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
 * Subject の末尾 (前後空白を除いた上で) が既に「最新情報」で終わっている場合は
 * 付け足さない (例: Subject が「〇〇の最新情報」だと「〇〇の最新情報 最新情報」という
 * 二重付与クエリになってしまうバグの修正)。鮮度確認・care 自発リサーチの
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
 * 処理順は 依頼 (StudyTopic pending) → 鮮度確認の依頼 → care 自発リサーチ。
 * `maxQueriesPerRun`（既定 `ACQUIRE_MAX_QUERIES_PER_RUN`）を 3 ソース合算で消費する。
 *
 * 鮮度確認の依頼は、会話や通知で Topic が使われたときに、期限 (NextReview) 切れの WEB fact を
 * 持つ Topic について記録される。期限ごとに全 Topic を走査すると会話に出ない Topic まで
 * 調べ直してしまうため、使われた Topic だけを古い依頼から処理する。
 * 1 Topic に数十〜百件の fact が付くケースがあり、fact 単位で research すると同一トピックへ
 * 同じクエリを何度も発行してしまうため、**research はトピックにつき 1 回** (= budget 1 消費) とし、
 * そのトピックの期限切れ fact 全部の `NextReview` をまとめて前方更新する。
 * 枠・予算で止まった依頼は残し、次の回で処理する。
 *
 * 鮮度確認は、変化検知 (`changeDetector`) で「変化があった時だけ」WEBRAW を書く
 * (陳腐な再要約を止める)。変化の有無に関わらず (失敗時も) 対象 fact 全部の `NextReview` を
 * 前方更新し、同じ fact を調べ直し続けないようにする。
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
    freshnessCheckRequestRepo,
    researchClient,
    changeDetector,
    character,
    lifecycle,
    researchAllowance,
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
      dailyLimitReached: false,
      counterFailed: false,
      webSearchCalls: 0,
    };
  }

  let budget = maxQueriesPerRun;
  let requestsProcessed = 0;
  let staleRefreshed = 0;
  let staleChanged = 0;
  let staleFactsReviewed = 0;
  let selfStudied = 0;
  let webRawWritten = 0;
  let dailyLimitReached = false;
  let counterFailed = false;

  /**
   * リサーチを呼ぶ直前に枠を 1 回分使う。使えなければ、残りの予算を 0 にして以降のリサーチを止める。
   * 上限に達した後は同じ日のうちは何度問い合わせても使えず、記録の障害も続く可能性が高いため、
   * 1 組につき 1 度だけ問い合わせて止める。
   */
  const tryConsumeAllowance = async (): Promise<boolean> => {
    try {
      if (await researchAllowance.tryConsume()) return true;
      dailyLimitReached = true;
      logger.info('[acquire] 1 日の上限に達したため勉強を止めます', { userId, characterId });
    } catch (err) {
      // 数えられないまま勉強すると原価の上限を守れないため、止める側に倒す。
      counterFailed = true;
      logger.warn('[acquire] 勉強の回数の記録に失敗したため勉強を止めます', {
        userId,
        characterId,
        err: toErrorMessage(err),
      });
    }
    budget = 0;
    return false;
  };
  let webSearchCalls = 0;

  // ---- 1. 依頼（StudyTopic pending）を消費 ----
  if (budget > 0) {
    const pendingTopics = await studyTopicRepo.listByStatus(userId, characterId, 'pending');

    for (const studyTopic of pendingTopics) {
      if (budget <= 0) break;

      try {
        await studyTopicRepo.updateStatus({
          userId,
          characterId,
          topicId: studyTopic.topicId,
          status: 'in_progress',
          priority: studyTopic.priority,
        });

        // 依頼が削除されていた場合などリサーチを呼ばずにスキップする判定が済んだ後、
        // リサーチを呼ぶ直前に数える。止めるときは in_progress の依頼を pending に戻す。
        if (!(await tryConsumeAllowance())) {
          try {
            await studyTopicRepo.updateStatus({
              userId,
              characterId,
              topicId: studyTopic.topicId,
              status: 'pending',
              priority: studyTopic.priority,
            });
          } catch (revertErr) {
            logger.warn('[acquire] 依頼（StudyTopic）の pending 復帰に失敗しました', {
              userId,
              characterId,
              topic: studyTopic.topic,
              err: toErrorMessage(revertErr),
            });
          }
          break;
        }

        // 成否にかかわらず試した時点で 1 回の実行の予算を使う。
        // 外部の障害時に、1 回の実行で 1 日の枠を使い切らないようにするため。
        budget--;
        const result = await researchClient.research(studyTopic.topic, character);
        // 後続の書き込みが失敗しても検索は課金済みのため、research 直後に加算する。
        webSearchCalls += result.webSearchCalls?.total ?? 0;

        await webRawRepo.put({
          userId,
          characterId,
          query: studyTopic.topic,
          rawText: result.summary,
          sourceUrls: result.sourceUrls,
          origin: 'request',
          requestText: studyTopic.topic,
          requestedAt: studyTopic.createdAt,
        });
        webRawWritten++;

        await studyTopicRepo.updateStatus({
          userId,
          characterId,
          topicId: studyTopic.topicId,
          status: 'done',
          priority: studyTopic.priority,
        });

        requestsProcessed++;
      } catch (err) {
        // 取得から更新までの間にアカウント削除などでトピックが消えた場合は、
        // 復帰させる対象もないため、バッチ全体を止めずに次の依頼へ進む。
        if (err instanceof EntityNotFoundError) {
          logger.warn('[acquire] 依頼（StudyTopic）が削除されていたためスキップしました', {
            userId,
            characterId,
            topic: studyTopic.topic,
            err: toErrorMessage(err),
          });
          continue;
        }
        logger.warn(
          '[acquire] 依頼（StudyTopic）のリサーチに失敗しました（pending へ戻して次回再試行）',
          {
            userId,
            characterId,
            topic: studyTopic.topic,
            err: toErrorMessage(err),
          }
        );
        // 失敗時は pending へ戻す。in_progress のまま残すと listByStatus('pending') に
        // 二度と拾われず（findPendingByTopic も係属中とみなす）、ユーザーの依頼が
        // 沈黙のうちに失われるため、確実に次回バッチで再試行できるようにする。
        try {
          await studyTopicRepo.updateStatus({
            userId,
            characterId,
            topicId: studyTopic.topicId,
            status: 'pending',
            priority: studyTopic.priority,
          });
        } catch (revertErr) {
          logger.warn('[acquire] 依頼（StudyTopic）の pending 復帰に失敗しました', {
            userId,
            characterId,
            topic: studyTopic.topic,
            err: toErrorMessage(revertErr),
          });
        }
      }
    }
  }

  // ---- 2. 鮮度確認の依頼 (Topic が使われたときに記録されたもの) ----
  // 依頼は古い順に処理する。Topic 単位で research を 1 回にまとめ (1 Topic に数十〜百件の
  // WEB fact が付くことがあり、fact 単位だと同じクエリを何度も発行してしまう)、
  // その Topic の期限切れ WEB fact 全部の NextReview をまとめて前進させる。
  // 枠・予算で止まったときは依頼を残し、次の回で処理する。
  if (budget > 0) {
    const requests = await freshnessCheckRequestRepo.listByCharacter(userId, characterId);

    /** 依頼を消す。消せなくても次の回に再処理されるだけなので、握って続行する */
    const deleteRequest = async (topicId: string): Promise<void> => {
      try {
        await freshnessCheckRequestRepo.delete({ userId, characterId, topicId });
      } catch (err) {
        logger.warn('[acquire] 鮮度確認の依頼の削除に失敗しました（次回に再処理される）', {
          userId,
          characterId,
          topicId,
          err: toErrorMessage(err),
        });
      }
    };

    for (const request of requests) {
      if (budget <= 0) break;

      const { topicId } = request;

      let topic: TopicEntity | null;
      let targetFacts: WebFactEntity[];
      try {
        topic = await topicRepo.getTopic({ userId, characterId, topicId });
        if (!topic) {
          // Topic が消えている。確認する対象が無いので依頼だけ片付ける。
          await deleteRequest(topicId);
          continue;
        }
        const webFacts = await topicRepo.listWebFacts(userId, characterId, topicId);
        // 古い事実の再確認に枠を使わないよう、読む側が使う新しい側の事実だけを対象にする。
        // 変化検知へ渡す本文の並びを変えないよう、元の並びのまま絞る
        const recent = new Set(selectRecentWebFacts(webFacts, WEB_FACT_TOPIC_LIMIT));
        targetFacts = webFacts.filter((f) => recent.has(f) && isStaleWebFact(f, nowMs));
      } catch (err) {
        logger.warn(
          '[acquire] 鮮度確認の依頼の Topic 読み取りに失敗しました（依頼を残してスキップ）',
          { userId, characterId, topicId, err: toErrorMessage(err) }
        );
        continue;
      }

      if (targetFacts.length === 0) {
        // 依頼の後に他の経路で既に新しくなっている。
        await deleteRequest(topicId);
        continue;
      }

      const query = buildLatestInfoQuery(topic.subject);
      // 変化検知の existingText は対象 fact 全部の Text を改行区切りで連結する
      // （インターフェース `hasChanged(existingText, fresh)` は変更しない）。
      const existingText = targetFacts.map((f) => f.text).join('\n');

      const bumpAllNextReview = async (): Promise<void> => {
        for (const fact of targetFacts) {
          try {
            await topicRepo.updateWebFactNextReview(
              { userId, characterId, topicId: fact.topicId, factId: fact.factId },
              computeNextReview(fact.volatility as 'low' | 'medium' | 'high', nowMs)
            );
            staleFactsReviewed++;
          } catch (bumpErr) {
            logger.warn('[acquire] 鮮度切れ fact の NextReview 前進に失敗しました', {
              userId,
              characterId,
              topicId: fact.topicId,
              factId: fact.factId,
              err: toErrorMessage(bumpErr),
            });
          }
        }
      };

      if (!(await tryConsumeAllowance())) break;

      try {
        const result = await researchClient.research(query, character);
        // 後続の書き込みが失敗しても検索は課金済みのため、research 直後に加算する。
        webSearchCalls += result.webSearchCalls?.total ?? 0;
        const changed = await changeDetector.hasChanged(existingText, result);

        if (changed) {
          await webRawRepo.put({
            userId,
            characterId,
            query,
            rawText: result.summary,
            sourceUrls: result.sourceUrls,
            origin: 'stale',
          });
          webRawWritten++;
          staleChanged++;
        }

        // 変化の有無に関わらず対象 fact 全部の NextReview を前方更新する。
        // 期限が過ぎたままだと、次にこの Topic が使われるたびに同じ確認が依頼される。
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
        // 失敗しても research を試行した以上は budget を消費する (障害時に 1 実行で
        // 依頼の件数ぶん research が走らないようにする)。
        budget--;
        // research/検知/書き込みのいずれかで失敗しても、同じ fact を毎回「期限切れ」として
        // 調べ直し続けて枠を占有しないよう (poison pill)、対象 fact 全部を best-effort で前進させる。
        await bumpAllNextReview();
      }

      // 成否にかかわらず、試した依頼は消す (失敗した fact は NextReview を前進させてあり、
      // 次に使われたときに期限が来ていれば再び依頼される)。
      await deleteRequest(topicId);
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
      // 揮発 fact の鮮度追随は鮮度確認の依頼が別途担うため、ここでは穴埋めに限定する。
      try {
        const webFacts = await topicRepo.listWebFacts(userId, characterId, header.topicId);
        const latestObservedAt = webFacts.reduce((max, f) => Math.max(max, f.observedAt), 0);
        if (latestObservedAt > 0 && nowMs - latestObservedAt < ACQUIRE_SELF_STUDY_COOLDOWN_MS) {
          continue;
        }
      } catch (err) {
        // クールダウン判定の読み取り失敗は握って研究続行（取りこぼしより再取得を優先）
        logger.warn('[acquire] care 自発リサーチのクールダウン判定に失敗しました（続行）', {
          userId,
          characterId,
          topicId: header.topicId,
          err: toErrorMessage(err),
        });
      }

      if (!(await tryConsumeAllowance())) break;

      try {
        const query = buildLatestInfoQuery(header.subject);
        // 成否にかかわらず試した時点で 1 回の実行の予算を使う（依頼と同じ理由）。
        budget--;
        const result = await researchClient.research(query, character);
        // 後続の書き込みが失敗しても検索は課金済みのため、research 直後に加算する。
        webSearchCalls += result.webSearchCalls?.total ?? 0;

        await webRawRepo.put({
          userId,
          characterId,
          query,
          rawText: result.summary,
          sourceUrls: result.sourceUrls,
          origin: 'auto',
        });
        webRawWritten++;
        selfStudied++;
      } catch (err) {
        logger.warn('[acquire] care 自発リサーチに失敗しました（スキップして継続）', {
          userId,
          characterId,
          topicId: header.topicId,
          subject: header.subject,
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
    dailyLimitReached,
    counterFailed,
    webSearchCalls,
  };
}
