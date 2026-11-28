import { CRITICAL_CANDIDATE_TOPIC_LIMIT, NOTIFY_CRITICAL_CARE_THRESHOLD } from '../constants.js';
import type { NotificationEventEntity } from '../entities/notification-event.entity.js';
import type { TopicEntity } from '../entities/topic.entity.js';
import type { WebFactEntity } from '../entities/web-fact.entity.js';
import { hasStaleWebFact } from '../study/freshness-check.js';
import type { DetectCriticalCandidate, SentCritical } from './escalation.js';

/**
 * critical 判定の候補にする Topic を、care 降順の Topic ヘッダから選ぶ。
 *
 * care 閾値未満は判定側でも LLM をスキップするため、WEB fact の読み取り (DynamoDB Query) の前に
 * ここで外して無駄な読み取りを避ける。入力は care 降順である前提で、先頭から上限件数まで取る。
 */
export function selectCriticalCandidateTopics<T extends Pick<TopicEntity, 'care'>>(
  topics: readonly T[]
): T[] {
  return topics
    .filter((topic) => topic.care >= NOTIFY_CRITICAL_CARE_THRESHOLD)
    .slice(0, CRITICAL_CANDIDATE_TOPIC_LIMIT);
}

export interface PartitionedCriticalCandidates {
  /** 判定に渡す候補 */
  candidates: DetectCriticalCandidate[];
  /** 確認が要る WEB fact を持つため、判定の候補から外した話題 */
  staleExcluded: DetectCriticalCandidate[];
}

/**
 * WEB fact を読んだ候補を、判定に渡すものと鮮度切れで外すものに分ける。
 *
 * 確認が済むまでは延期や中止を拾えず、「もうすぐある」と誤って重要通知しうるため判定から外す。
 * 外したものは捨てず、理由の表示に使えるよう別に返す。
 */
export function partitionCriticalCandidates(
  readCandidates: ReadonlyArray<{ topic: TopicEntity; webFacts: readonly WebFactEntity[] }>,
  nowMs: number
): PartitionedCriticalCandidates {
  const candidates: DetectCriticalCandidate[] = [];
  const staleExcluded: DetectCriticalCandidate[] = [];
  for (const { topic, webFacts } of readCandidates) {
    const candidate = { topic, webFacts: [...webFacts] };
    (hasStaleWebFact(webFacts, nowMs) ? staleExcluded : candidates).push(candidate);
  }
  return { candidates, staleExcluded };
}

/**
 * 通知の記録から、送り済みの重要通知を判定に渡す形に直す。
 * 話題を特定できない重要通知は、同じ話題の再通知を止める照合に使えないため除く。
 */
export function toSentCriticals(
  events: ReadonlyArray<Pick<NotificationEventEntity, 'kind' | 'topicId' | 'eventDate'>>
): SentCritical[] {
  return events.flatMap((event) =>
    event.kind === 'critical' && event.topicId !== undefined
      ? [{ topicId: event.topicId, eventDate: event.eventDate }]
      : []
  );
}
