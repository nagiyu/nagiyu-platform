/**
 * @jest-environment node
 */
import { loadStatusSnapshot } from '@/lib/server/status';
import {
  createLifecycleRepository,
  createMessageRepository,
  createNotificationEventRepository,
  createStudyTopicRepository,
  createStudyUsageRepository,
  createFreshnessCheckRequestRepository,
  createTopicRepository,
  NOTIFY_EVENT_READ_LIMIT,
  NOTIFY_TOPIC_HEADER_READ_LIMIT,
} from '@nagiyu/livetalk-core';

jest.mock('@nagiyu/livetalk-core', () => ({
  ...jest.requireActual('@nagiyu/livetalk-core'),
  createLifecycleRepository: jest.fn(),
  createNotificationEventRepository: jest.fn(),
  createStudyTopicRepository: jest.fn(),
  createMessageRepository: jest.fn(),
  createStudyUsageRepository: jest.fn(),
  createFreshnessCheckRequestRepository: jest.fn(),
  createTopicRepository: jest.fn(),
}));

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// 日本時間の 12:00 (起床後・就寝前)
const NOW = new Date('2026-06-10T03:00:00.000Z');

const makeEvent = (notifId: string, characterId: string, createdAt: number) => ({
  userId: 'u1',
  notifId,
  characterId,
  kind: 'normal' as const,
  title: 'タイトル',
  body: `本文-${notifId}`,
  createdAt,
  updatedAt: createdAt,
  expiresAt: 9_999_999_999_000,
});

function setup(options: {
  lifecycle?: unknown;
  events?: Record<string, unknown>[];
  messages?: { role: string; createdAt: number }[];
  pending?: number;
  /** キャラクター別の lifecycle。指定があれば lifecycle より優先する */
  lifecycleFor?: Record<string, unknown>;
  /** キャラクター別の会話。指定があれば messages より優先する */
  messagesFor?: Record<string, { role: string; createdAt: number }[]>;
  usage?: { characterCount: number; totalCount: number };
  freshnessRequests?: { topicId: string; createdAt: number }[];
  topics?: { topicId: string; subject: string; care: number }[];
  webFacts?: Record<string, unknown[]>;
}) {
  const listByUser = jest.fn(async () => options.events ?? []);
  // 実際のリポジトリと同じく、since より後の会話だけを返す
  const listSince = jest.fn(async (_userId: string, characterId: string, since: number) =>
    (options.messagesFor?.[characterId] ?? options.messages ?? []).filter(
      (m) => m.createdAt > since
    )
  );
  (createLifecycleRepository as jest.Mock).mockReturnValue({
    get: jest.fn(async ({ characterId }: { characterId: string }) =>
      options.lifecycleFor
        ? (options.lifecycleFor[characterId] ?? null)
        : (options.lifecycle ?? null)
    ),
  });
  const readUsage = jest.fn(async () => options.usage ?? { characterCount: 0, totalCount: 0 });
  (createStudyUsageRepository as jest.Mock).mockReturnValue({ readUsage });
  (createFreshnessCheckRequestRepository as jest.Mock).mockReturnValue({
    listByCharacter: jest.fn(async () => options.freshnessRequests ?? []),
  });
  const listTopicHeadersByCareDesc = jest.fn(async () => options.topics ?? []);
  const listWebFacts = jest.fn(
    async (_u: string, _c: string, topicId: string) => options.webFacts?.[topicId] ?? []
  );
  (createTopicRepository as jest.Mock).mockReturnValue({
    listTopicHeadersByCareDesc,
    listWebFacts,
  });
  (createNotificationEventRepository as jest.Mock).mockReturnValue({ listByUser });
  (createMessageRepository as jest.Mock).mockReturnValue({ listSince });
  (createStudyTopicRepository as jest.Mock).mockReturnValue({
    listByStatus: jest.fn(async () => Array(options.pending ?? 0).fill({ topicId: 't' })),
  });
  return { listByUser, listSince, readUsage, listTopicHeadersByCareDesc, listWebFacts };
}

describe('loadStatusSnapshot', () => {
  beforeEach(() => jest.clearAllMocks());

  it('会話を通知バッチと同じ直近 7 日から読み、通知の記録をバッチと同じ件数で読む', async () => {
    const { listByUser, listSince } = setup({});

    await loadStatusSnapshot('u1', 'hiyori', NOW);

    expect(listSince).toHaveBeenCalledWith('u1', 'hiyori', NOW.getTime() - 7 * DAY);
    expect(listByUser).toHaveBeenCalledWith('u1', NOTIFY_EVENT_READ_LIMIT);
  });

  it('7 日より前の会話は判定に入らない', async () => {
    // 8 日前の会話が判定に入れば経過 8 日で long、入らなければ会話なしで veryLong になる
    setup({ messages: [{ role: 'user', createdAt: NOW.getTime() - 8 * DAY }] });

    const snapshot = await loadStatusSnapshot('u1', 'hiyori', NOW);

    expect(snapshot.notifyDecision).toMatchObject({ notify: true, toneBucket: 'veryLong' });
  });

  it('生活サイクルがなければ既定値と null のプロファイルを返す', async () => {
    setup({ pending: 2 });

    const snapshot = await loadStatusSnapshot('u1', 'hiyori', NOW);

    expect(snapshot.lifecycle).toMatchObject({
      bedtime: '01:30',
      wakeUpTime: '09:30',
      userActivityProfile: null,
    });
    expect(snapshot.studyTopicPendingCount).toBe(2);
  });

  it('生活サイクルのプロファイルをそのまま返す', async () => {
    const profile = {
      morningPeak: '09:00',
      eveningPeak: '21:00',
      sampleSize: 10,
      lastLearnedAt: '2026-06-01T00:00:00.000Z',
    };
    setup({
      lifecycle: {
        userId: 'u1',
        characterId: 'hiyori',
        bedtime: '23:00',
        wakeUpTime: '08:00',
        userActivityProfile: profile,
        createdAt: 0,
        updatedAt: 0,
      },
    });

    const snapshot = await loadStatusSnapshot('u1', 'hiyori', NOW);

    expect(snapshot.lifecycle).toMatchObject({
      bedtime: '23:00',
      wakeUpTime: '08:00',
      userActivityProfile: profile,
    });
  });

  it('通知の記録を表示キャラだけに絞り、一覧は最大 5 件にする', async () => {
    const base = NOW.getTime() - 20 * DAY;
    const events = [
      makeEvent('other', 'ageha', base + 100),
      ...Array.from({ length: 7 }, (_, i) => makeEvent(`own-${i}`, 'hiyori', base - i * 1000)),
    ];
    setup({ events });

    const snapshot = await loadStatusSnapshot('u1', 'hiyori', NOW);

    expect(snapshot.recentNotifications.map((e) => e.notifId)).toEqual([
      'own-0',
      'own-1',
      'own-2',
      'own-3',
      'own-4',
    ]);
  });

  it('not_due のときだけ解除予測を返す', async () => {
    const msgAt = NOW.getTime() - HOUR;
    setup({ messages: [{ role: 'user', createdAt: msgAt }] });

    const snapshot = await loadStatusSnapshot('u1', 'hiyori', NOW);

    expect(snapshot.notifyDecision).toMatchObject({ notify: false, reason: 'not_due' });
    expect(snapshot.nextEarliestAt).toBe(msgAt + 24 * HOUR);
  });

  it('通知可能なときは解除予測を含めない', async () => {
    setup({});

    const snapshot = await loadStatusSnapshot('u1', 'hiyori', NOW);

    expect(snapshot.notifyDecision).toMatchObject({ notify: true });
    expect(snapshot).not.toHaveProperty('nextEarliestAt');
  });

  it('ユーザー以外の発話は判定に使わない', async () => {
    setup({ messages: [{ role: 'assistant', createdAt: NOW.getTime() - HOUR }] });

    const snapshot = await loadStatusSnapshot('u1', 'hiyori', NOW);

    expect(snapshot.notifyDecision).toMatchObject({ notify: true });
  });

  describe('3 日ルール (studyPause)', () => {
    it('発話がなければ停止中で、時刻は null', async () => {
      setup({});

      const { studyPause } = await loadStatusSnapshot('u1', 'hiyori', NOW);

      expect(studyPause).toEqual({ paused: true, lastUserMessageAt: null, pausesAt: null });
    });

    it('72 時間経っていなければ勉強中で、止まる時刻は最後の発話の 72 時間後', async () => {
      const at = NOW.getTime() - 72 * HOUR + 1;
      setup({ messages: [{ role: 'user', createdAt: at }] });

      const { studyPause } = await loadStatusSnapshot('u1', 'hiyori', NOW);

      expect(studyPause).toEqual({
        paused: false,
        lastUserMessageAt: at,
        pausesAt: at + 72 * HOUR,
      });
    });

    it('72 時間ちょうどで停止する', async () => {
      const at = NOW.getTime() - 72 * HOUR;
      setup({ messages: [{ role: 'user', createdAt: at }] });

      const { studyPause } = await loadStatusSnapshot('u1', 'hiyori', NOW);

      expect(studyPause).toEqual({ paused: true, lastUserMessageAt: at, pausesAt: NOW.getTime() });
    });

    it('アシスタントの発話は最後の発話に数えない', async () => {
      setup({
        messages: [
          { role: 'user', createdAt: NOW.getTime() - 5 * HOUR },
          { role: 'assistant', createdAt: NOW.getTime() - HOUR },
        ],
      });

      const { studyPause } = await loadStatusSnapshot('u1', 'hiyori', NOW);

      expect(studyPause.lastUserMessageAt).toBe(NOW.getTime() - 5 * HOUR);
    });
  });

  describe('勉強の日次の回数 (studyUsage)', () => {
    const lifecycle = (characterId: string) => ({
      userId: 'u1',
      characterId,
      bedtime: '01:30',
      wakeUpTime: '09:30',
      createdAt: 0,
      updatedAt: 0,
    });
    const recent = [{ role: 'user', createdAt: NOW.getTime() - HOUR }];

    it('勉強中が 0 キャラなら上限は 0 で、上限到達になる', async () => {
      const { readUsage } = setup({});

      const { studyUsage } = await loadStatusSnapshot('u1', 'hiyori', NOW);

      expect(studyUsage).toEqual({
        characterCount: 0,
        totalCount: 0,
        characterLimit: 0,
        totalLimit: 20,
        studyingCharacterCount: 0,
        limitReached: true,
      });
      expect(readUsage).toHaveBeenCalledWith({
        userId: 'u1',
        characterId: 'hiyori',
        nowMs: NOW.getTime(),
      });
    });

    it('勉強中のキャラ数で合計の上限を等分する', async () => {
      setup({
        lifecycleFor: { hiyori: lifecycle('hiyori'), ageha: lifecycle('ageha') },
        messages: recent,
        usage: { characterCount: 9, totalCount: 10 },
      });

      const { studyUsage } = await loadStatusSnapshot('u1', 'hiyori', NOW);

      expect(studyUsage).toMatchObject({
        studyingCharacterCount: 2,
        characterLimit: 10,
        limitReached: false,
      });
    });

    it('lifecycle がないキャラと 3 日ルールで止まっているキャラは数えない', async () => {
      setup({
        lifecycleFor: { hiyori: lifecycle('hiyori'), ageha: lifecycle('ageha') },
        messagesFor: { hiyori: recent, ageha: [] },
      });

      const { studyUsage } = await loadStatusSnapshot('u1', 'hiyori', NOW);
      expect(studyUsage).toMatchObject({ studyingCharacterCount: 1, characterLimit: 20 });

      setup({
        lifecycleFor: { hiyori: lifecycle('hiyori') },
        messages: recent,
      });
      const second = await loadStatusSnapshot('u1', 'hiyori', NOW);
      expect(second.studyUsage.studyingCharacterCount).toBe(1);
    });

    it('キャラ別の上限に達したら上限到達になる', async () => {
      setup({
        lifecycleFor: { hiyori: lifecycle('hiyori'), ageha: lifecycle('ageha') },
        messages: recent,
        usage: { characterCount: 10, totalCount: 10 },
      });

      const { studyUsage } = await loadStatusSnapshot('u1', 'hiyori', NOW);

      expect(studyUsage.limitReached).toBe(true);
    });

    it('合計の上限に達したら、キャラ別の上限内でも上限到達になる', async () => {
      setup({
        lifecycleFor: { hiyori: lifecycle('hiyori'), ageha: lifecycle('ageha') },
        messages: recent,
        usage: { characterCount: 1, totalCount: 20 },
      });

      const { studyUsage } = await loadStatusSnapshot('u1', 'hiyori', NOW);

      expect(studyUsage.limitReached).toBe(true);
    });
  });

  describe('勉強の状態 (studyState)', () => {
    const lifecycle = {
      userId: 'u1',
      characterId: 'hiyori',
      bedtime: '01:30',
      wakeUpTime: '09:30',
      createdAt: 0,
      updatedAt: 0,
    };
    const recent = [{ role: 'user', createdAt: NOW.getTime() - HOUR }];

    it('生活サイクルが未登録なら、3 日ルールや回数より先に no_lifecycle になる', async () => {
      setup({ messages: recent });

      const { studyState } = await loadStatusSnapshot('u1', 'hiyori', NOW);

      expect(studyState).toBe('no_lifecycle');
    });

    it('生活サイクルがあり 3 日ルールで止まっていれば paused', async () => {
      setup({ lifecycle });

      const { studyState } = await loadStatusSnapshot('u1', 'hiyori', NOW);

      expect(studyState).toBe('paused');
    });

    it('止まっておらず回数の上限に達していれば limit_reached', async () => {
      setup({
        lifecycleFor: { hiyori: lifecycle, ageha: { ...lifecycle, characterId: 'ageha' } },
        messages: recent,
        usage: { characterCount: 10, totalCount: 10 },
      });

      const { studyState } = await loadStatusSnapshot('u1', 'hiyori', NOW);

      expect(studyState).toBe('limit_reached');
    });

    it('どれにも当たらなければ studying', async () => {
      setup({
        lifecycleFor: { hiyori: lifecycle, ageha: { ...lifecycle, characterId: 'ageha' } },
        messages: recent,
        usage: { characterCount: 1, totalCount: 1 },
      });

      const { studyState } = await loadStatusSnapshot('u1', 'hiyori', NOW);

      expect(studyState).toBe('studying');
    });
  });

  describe('鮮度確認の依頼待ち', () => {
    it('件数と、各依頼の topicId・記録時刻を返す', async () => {
      setup({
        freshnessRequests: [
          { topicId: 't1', createdAt: 100 },
          { topicId: 't2', createdAt: 200 },
        ],
      });

      const { freshnessCheckRequests } = await loadStatusSnapshot('u1', 'hiyori', NOW);

      expect(freshnessCheckRequests).toEqual({
        count: 2,
        requests: [
          { topicId: 't1', createdAt: 100 },
          { topicId: 't2', createdAt: 200 },
        ],
      });
    });
  });

  describe('重要通知の判定の手前 (criticalCandidates)', () => {
    const recent = [{ role: 'user', createdAt: NOW.getTime() - HOUR }];
    const lifecycle = {
      userId: 'u1',
      characterId: 'hiyori',
      bedtime: '01:30',
      wakeUpTime: '09:30',
      createdAt: 0,
      updatedAt: 0,
    };
    const topic = (topicId: string, care: number) => ({
      topicId,
      subject: `話題-${topicId}`,
      care,
    });

    it('勉強が止まっているときは判定せず、Topic を読まない', async () => {
      const { listTopicHeadersByCareDesc, listWebFacts } = setup({
        lifecycle,
        topics: [topic('t1', 5)],
      });

      const { criticalCandidates } = await loadStatusSnapshot('u1', 'hiyori', NOW);

      expect(criticalCandidates).toEqual({
        evaluated: false,
        skipReason: 'study_paused',
        candidates: [],
        staleExcluded: [],
        sentCriticals: [],
      });
      expect(listTopicHeadersByCareDesc).not.toHaveBeenCalled();
      expect(listWebFacts).not.toHaveBeenCalled();
    });

    it('生活サイクルが未登録なら no_lifecycle で判定せず、Topic を読まない', async () => {
      const { listTopicHeadersByCareDesc, listWebFacts } = setup({
        messages: recent,
        topics: [topic('t1', 5)],
      });

      const { criticalCandidates } = await loadStatusSnapshot('u1', 'hiyori', NOW);

      expect(criticalCandidates).toEqual({
        evaluated: false,
        skipReason: 'no_lifecycle',
        candidates: [],
        staleExcluded: [],
        sentCriticals: [],
      });
      expect(listTopicHeadersByCareDesc).not.toHaveBeenCalled();
      expect(listWebFacts).not.toHaveBeenCalled();
    });

    it('care の閾値以上の話題だけを候補にし、WEB fact の中身は出さない', async () => {
      const { listTopicHeadersByCareDesc } = setup({
        lifecycle,
        messages: recent,
        topics: [topic('t1', 5), topic('t2', 1)],
        webFacts: { t1: [{ factId: 'f1', volatility: 'stable', content: '秘密の中身' }] },
      });

      const { criticalCandidates } = await loadStatusSnapshot('u1', 'hiyori', NOW);

      expect(listTopicHeadersByCareDesc).toHaveBeenCalledWith(
        'u1',
        'hiyori',
        NOTIFY_TOPIC_HEADER_READ_LIMIT
      );
      expect(criticalCandidates.evaluated).toBe(true);
      expect(criticalCandidates.skipReason).toBeNull();
      expect(criticalCandidates.candidates).toEqual([
        { topicId: 't1', subject: '話題-t1', care: 5 },
      ]);
      expect(JSON.stringify(criticalCandidates)).not.toContain('秘密の中身');
    });

    it('鮮度切れの WEB fact を持つ話題は候補から外れ、staleExcluded に出る', async () => {
      setup({
        lifecycle,
        messages: recent,
        topics: [topic('t1', 5), topic('t2', 4)],
        webFacts: {
          t1: [{ factId: 'f1', volatility: 'high', nextReview: NOW.getTime() - 1 }],
          t2: [{ factId: 'f2', volatility: 'high', nextReview: NOW.getTime() + HOUR }],
        },
      });

      const { criticalCandidates } = await loadStatusSnapshot('u1', 'hiyori', NOW);

      expect(criticalCandidates.candidates.map((t) => t.topicId)).toEqual(['t2']);
      expect(criticalCandidates.staleExcluded.map((t) => t.topicId)).toEqual(['t1']);
    });

    it('送り済みの重要通知を表示キャラの記録から返し、topicId のないものは除く', async () => {
      setup({
        messages: recent,
        events: [
          {
            ...makeEvent('c1', 'hiyori', 1000),
            kind: 'critical' as const,
            topicId: 't1',
            eventDate: '2026-06-20',
          },
          { ...makeEvent('c2', 'hiyori', 900), kind: 'critical' as const, topicId: 't2' },
          { ...makeEvent('c3', 'hiyori', 800), kind: 'critical' as const },
          { ...makeEvent('c4', 'ageha', 700), kind: 'critical' as const, topicId: 't9' },
        ],
      });

      const { criticalCandidates } = await loadStatusSnapshot('u1', 'hiyori', NOW);

      expect(criticalCandidates.sentCriticals).toEqual([
        { topicId: 't1', eventDate: '2026-06-20' },
        { topicId: 't2', eventDate: null },
      ]);
    });

    it('勉強が止まっていても送り済みの重要通知は返す', async () => {
      setup({
        lifecycle,
        events: [{ ...makeEvent('c1', 'hiyori', 1000), kind: 'critical' as const, topicId: 't1' }],
      });

      const { criticalCandidates } = await loadStatusSnapshot('u1', 'hiyori', NOW);

      expect(criticalCandidates.evaluated).toBe(false);
      expect(criticalCandidates.sentCriticals).toEqual([{ topicId: 't1', eventDate: null }]);
    });
  });
});
