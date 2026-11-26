import {
  partitionCriticalCandidates,
  selectCriticalCandidateTopics,
  toSentCriticals,
} from '../../../src/notification/critical-candidates.js';
import {
  CRITICAL_CANDIDATE_TOPIC_LIMIT,
  NOTIFY_CRITICAL_CARE_THRESHOLD,
} from '../../../src/constants.js';
import type { TopicEntity } from '../../../src/entities/topic.entity.js';
import type { WebFactEntity } from '../../../src/entities/web-fact.entity.js';

const NOW_MS = Date.parse('2026-06-07T01:00:00Z');

function makeTopic(topicId: string, care: number): TopicEntity {
  return {
    userId: 'u1',
    characterId: 'hiyori',
    topicId,
    subject: topicId,
    canonicalSummary: '要約',
    category: 'ゲーム',
    care,
    embedding: [],
    createdAt: 1000,
    updatedAt: 1000,
  };
}

function makeWebFact(overrides: Partial<WebFactEntity> = {}): WebFactEntity {
  return {
    userId: 'u1',
    characterId: 'hiyori',
    topicId: 't1',
    factId: 'f1',
    text: '内容',
    sourceUrls: [],
    volatility: 'medium',
    observedAt: 1000,
    createdAt: 1000,
    ...overrides,
  };
}

describe('selectCriticalCandidateTopics', () => {
  it('care が閾値ちょうどの話題は含め、閾値未満は除く', () => {
    const topics = [
      makeTopic('a', NOTIFY_CRITICAL_CARE_THRESHOLD),
      makeTopic('b', NOTIFY_CRITICAL_CARE_THRESHOLD - 1),
    ];
    expect(selectCriticalCandidateTopics(topics).map((t) => t.topicId)).toEqual(['a']);
  });

  it('上限件数までを先頭から取る', () => {
    const topics = Array.from({ length: CRITICAL_CANDIDATE_TOPIC_LIMIT + 2 }, (_, i) =>
      makeTopic(`t${i}`, 10 - i)
    );
    const selected = selectCriticalCandidateTopics(topics);
    expect(selected).toHaveLength(CRITICAL_CANDIDATE_TOPIC_LIMIT);
    expect(selected.map((t) => t.topicId)).toEqual(
      topics.slice(0, CRITICAL_CANDIDATE_TOPIC_LIMIT).map((t) => t.topicId)
    );
  });

  it('上限ちょうどの件数ならすべて返す', () => {
    const topics = Array.from({ length: CRITICAL_CANDIDATE_TOPIC_LIMIT }, (_, i) =>
      makeTopic(`t${i}`, 5)
    );
    expect(selectCriticalCandidateTopics(topics)).toHaveLength(CRITICAL_CANDIDATE_TOPIC_LIMIT);
  });

  it('空なら空を返す', () => {
    expect(selectCriticalCandidateTopics([])).toEqual([]);
  });
});

describe('partitionCriticalCandidates', () => {
  it('鮮度切れの WEB fact を持つ話題は候補から外し、別に返す', () => {
    const fresh = { topic: makeTopic('fresh', 5), webFacts: [makeWebFact()] };
    const stale = {
      topic: makeTopic('stale', 5),
      webFacts: [makeWebFact({ nextReview: NOW_MS - 1 })],
    };

    const result = partitionCriticalCandidates([fresh, stale], NOW_MS);

    expect(result.candidates.map((c) => c.topic.topicId)).toEqual(['fresh']);
    expect(result.staleExcluded.map((c) => c.topic.topicId)).toEqual(['stale']);
    expect(result.staleExcluded[0]?.webFacts).toHaveLength(1);
  });

  it('再検証予定時刻ちょうどは鮮度切れ、まだ先なら候補に残る', () => {
    const atBoundary = {
      topic: makeTopic('at', 5),
      webFacts: [makeWebFact({ nextReview: NOW_MS })],
    };
    const future = {
      topic: makeTopic('future', 5),
      webFacts: [makeWebFact({ nextReview: NOW_MS + 1 })],
    };

    const result = partitionCriticalCandidates([atBoundary, future], NOW_MS);

    expect(result.staleExcluded.map((c) => c.topic.topicId)).toEqual(['at']);
    expect(result.candidates.map((c) => c.topic.topicId)).toEqual(['future']);
  });

  it('stable の fact は再確認の対象にならず候補に残る', () => {
    const stable = {
      topic: makeTopic('s', 5),
      webFacts: [makeWebFact({ volatility: 'stable', nextReview: NOW_MS - 1 })],
    };
    expect(partitionCriticalCandidates([stable], NOW_MS).candidates).toHaveLength(1);
  });

  it('WEB fact が無い話題は候補に残り、入力順を保つ', () => {
    const result = partitionCriticalCandidates(
      [
        { topic: makeTopic('a', 5), webFacts: [] },
        { topic: makeTopic('b', 5), webFacts: [] },
      ],
      NOW_MS
    );
    expect(result.candidates.map((c) => c.topic.topicId)).toEqual(['a', 'b']);
    expect(result.staleExcluded).toEqual([]);
  });
});

describe('toSentCriticals', () => {
  it('送り済みの重要通知を topicId と eventDate に直す', () => {
    expect(
      toSentCriticals([
        { kind: 'critical', topicId: 't1', eventDate: '2026-06-10' },
        { kind: 'critical', topicId: 't2' },
      ])
    ).toEqual([
      { topicId: 't1', eventDate: '2026-06-10' },
      { topicId: 't2', eventDate: undefined },
    ]);
  });

  it('平常通知と、topicId が無い重要通知は除く', () => {
    expect(
      toSentCriticals([
        { kind: 'normal', topicId: 't1' },
        { kind: 'critical' },
        { kind: 'critical', topicId: 't3', eventDate: '2026-06-11' },
      ])
    ).toEqual([{ topicId: 't3', eventDate: '2026-06-11' }]);
  });
});
