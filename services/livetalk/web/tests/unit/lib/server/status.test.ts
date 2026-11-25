/**
 * @jest-environment node
 */
import { loadStatusSnapshot } from '@/lib/server/status';
import {
  createLifecycleRepository,
  createMessageRepository,
  createNotificationEventRepository,
  createStudyTopicRepository,
  NOTIFY_EVENT_READ_LIMIT,
} from '@nagiyu/livetalk-core';

jest.mock('@nagiyu/livetalk-core', () => ({
  ...jest.requireActual('@nagiyu/livetalk-core'),
  createLifecycleRepository: jest.fn(),
  createNotificationEventRepository: jest.fn(),
  createStudyTopicRepository: jest.fn(),
  createMessageRepository: jest.fn(),
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
  events?: ReturnType<typeof makeEvent>[];
  messages?: { role: string; createdAt: number }[];
  pending?: number;
}) {
  const listByUser = jest.fn(async () => options.events ?? []);
  // 実際のリポジトリと同じく、since より後の会話だけを返す
  const listSince = jest.fn(async (_userId: string, _characterId: string, since: number) =>
    (options.messages ?? []).filter((m) => m.createdAt > since)
  );
  (createLifecycleRepository as jest.Mock).mockReturnValue({
    get: jest.fn(async () => options.lifecycle ?? null),
  });
  (createNotificationEventRepository as jest.Mock).mockReturnValue({ listByUser });
  (createMessageRepository as jest.Mock).mockReturnValue({ listSince });
  (createStudyTopicRepository as jest.Mock).mockReturnValue({
    listByStatus: jest.fn(async () => Array(options.pending ?? 0).fill({ topicId: 't' })),
  });
  return { listByUser, listSince };
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
});
