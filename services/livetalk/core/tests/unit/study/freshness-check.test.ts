import { InMemorySingleTableStore } from '@nagiyu/aws';
import {
  hasStaleWebFact,
  isStaleWebFact,
  requestFreshnessChecks,
} from '../../../src/study/freshness-check.js';
import { InMemoryFreshnessCheckRequestRepository } from '../../../src/repositories/in-memory-freshness-check-request.repository.js';
import type { FreshnessCheckRequestRepository } from '../../../src/repositories/freshness-check-request.repository.interface.js';
import type { WebFactEntity } from '../../../src/entities/web-fact.entity.js';
import { FRESHNESS_CHECK_REQUEST_TTL_SECONDS } from '../../../src/constants.js';

const NOW = 1_700_000_000_000;

function fact(overrides: Partial<WebFactEntity> = {}): WebFactEntity {
  return {
    userId: 'u1',
    characterId: 'hiyori',
    topicId: 't1',
    factId: 'f1',
    text: '事実',
    sourceUrls: [],
    volatility: 'high',
    nextReview: NOW - 1,
    observedAt: NOW - 1000,
    createdAt: NOW - 1000,
    ...overrides,
  };
}

describe('isStaleWebFact / hasStaleWebFact', () => {
  it('期限 (nextReview) ちょうど・過ぎたものは対象', () => {
    expect(isStaleWebFact(fact({ nextReview: NOW }), NOW)).toBe(true);
    expect(isStaleWebFact(fact({ nextReview: NOW - 1 }), NOW)).toBe(true);
  });

  it('期限前・stable・nextReview なしは対象外', () => {
    expect(isStaleWebFact(fact({ nextReview: NOW + 1 }), NOW)).toBe(false);
    expect(isStaleWebFact(fact({ volatility: 'stable', nextReview: NOW - 1 }), NOW)).toBe(false);
    expect(isStaleWebFact(fact({ nextReview: undefined }), NOW)).toBe(false);
  });

  it('1 件でも対象があれば true', () => {
    expect(hasStaleWebFact([fact({ nextReview: NOW + 1 }), fact()], NOW)).toBe(true);
    expect(hasStaleWebFact([], NOW)).toBe(false);
  });
});

describe('requestFreshnessChecks', () => {
  it('期限切れの fact を持つ Topic だけ依頼を記録し、TTL を付ける', async () => {
    const repository = new InMemoryFreshnessCheckRequestRepository(
      new InMemorySingleTableStore(),
      () => NOW
    );

    const count = await requestFreshnessChecks({
      repository,
      userId: 'u1',
      characterId: 'hiyori',
      topics: [
        { topicId: 'stale', webFacts: [fact()] },
        { topicId: 'fresh', webFacts: [fact({ nextReview: NOW + 1000 })] },
        { topicId: 'empty', webFacts: [] },
      ],
      nowMs: NOW,
    });

    expect(count).toBe(1);
    const list = await repository.listByCharacter('u1', 'hiyori');
    expect(list.map((r) => r.topicId)).toEqual(['stale']);
    expect(list[0].expiresAt).toBe(NOW + FRESHNESS_CHECK_REQUEST_TTL_SECONDS * 1000);
  });

  it('記録に失敗しても投げず、他の Topic は記録する', async () => {
    const put = jest.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({});
    const repository = { put } as unknown as FreshnessCheckRequestRepository;

    const count = await requestFreshnessChecks({
      repository,
      userId: 'u1',
      characterId: 'hiyori',
      topics: [
        { topicId: 'a', webFacts: [fact()] },
        { topicId: 'b', webFacts: [fact()] },
      ],
      nowMs: NOW,
    });

    expect(put).toHaveBeenCalledTimes(2);
    expect(count).toBe(1);
  });
});
