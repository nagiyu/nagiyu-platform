/**
 * @jest-environment node
 */
// core のバレルが引き込む openai が Response を要求するため、jsdom ではなく node で動かす
import { renderToStaticMarkup } from 'react-dom/server';
import StatusPage from '@/app/(protected)/status/page';
import { getSession } from '@/lib/server/session';
import {
  createLifecycleRepository,
  createNotificationEventRepository,
  createPushSubscriptionRepository,
  createSafetyEventRepository,
  createStudyTopicRepository,
  createMessageRepository,
  createFreshnessCheckRequestRepository,
  createTopicRepository,
  createProfileRepository,
  createStudyUsageRepository,
} from '@nagiyu/livetalk-core';
import type {
  LifecycleRepository,
  NotificationEventRepository,
  SafetyEventRepository,
  StudyTopicRepository,
  MessageRepository,
  ProfileRepository,
  StudyUsageRepository,
} from '@nagiyu/livetalk-core';

jest.mock('@/lib/server/session', () => ({
  getSession: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

jest.mock('@/components/StatusCharacterSwitcher', () => ({
  __esModule: true,
  default: jest.fn(() => null),
}));

jest.mock('@/components/StatusTestPush', () => ({
  __esModule: true,
  default: jest.fn(() => null),
}));

jest.mock('@nagiyu/livetalk-core', () => ({
  ...jest.requireActual('@nagiyu/livetalk-core'),
  createLifecycleRepository: jest.fn(),
  createNotificationEventRepository: jest.fn(),
  createPushSubscriptionRepository: jest.fn(),
  createSafetyEventRepository: jest.fn(),
  createStudyTopicRepository: jest.fn(),
  createMessageRepository: jest.fn(),
  createFreshnessCheckRequestRepository: jest.fn(),
  createTopicRepository: jest.fn(),
  createProfileRepository: jest.fn(),
  createStudyUsageRepository: jest.fn(),
}));

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockLifecycleRepo = createLifecycleRepository as jest.MockedFunction<
  typeof createLifecycleRepository
>;
const mockNotifRepo = createNotificationEventRepository as jest.MockedFunction<
  typeof createNotificationEventRepository
>;
const mockSafetyRepo = createSafetyEventRepository as jest.MockedFunction<
  typeof createSafetyEventRepository
>;
const mockStudyRepo = createStudyTopicRepository as jest.MockedFunction<
  typeof createStudyTopicRepository
>;
const mockMessageRepo = createMessageRepository as jest.MockedFunction<
  typeof createMessageRepository
>;

const mockProfileRepo = createProfileRepository as jest.MockedFunction<
  typeof createProfileRepository
>;
const mockStudyUsageRepo = createStudyUsageRepository as jest.MockedFunction<
  typeof createStudyUsageRepository
>;

const adminSession = {
  user: { id: 'u1', email: 'admin@example.com', name: 'Admin', roles: ['livetalk-admin'] },
  expires: new Date(Date.now() + 60 * 1000).toISOString(),
};

// 日本時間の 12:00 (起床後・就寝前)。1 日の境界は日本時間の 0 時
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

function setup(
  events: ReturnType<typeof makeEvent>[],
  extra: {
    messages?: { role: string; createdAt: number }[];
    /** 今日の回数。全利用者の合計の既定は 12 */
    usage?: { characterCount?: number; userTotal?: number; globalTotal?: number };
    /** セッションのロール。既定は管理者だけ (無料) */
    roles?: string[];
    /** Profile の作成時刻。null なら Profile がない */
    profileCreatedAt?: number | null;
    topics?: { topicId: string; subject: string; care: number }[];
    freshnessRequests?: { topicId: string; createdAt: number }[];
    /** false なら生活サイクルを未登録にする */
    hasLifecycle?: boolean;
    /** false なら購読を 0 件にする */
    hasSubscription?: boolean;
  } = {}
) {
  const listByUser = jest.fn(async () => events);
  mockGetSession.mockResolvedValue({
    ...adminSession,
    user: { ...adminSession.user, roles: extra.roles ?? adminSession.user.roles },
  });
  mockLifecycleRepo.mockReturnValue({
    get: jest.fn(async () =>
      extra.hasLifecycle === false
        ? null
        : {
            userId: 'u1',
            characterId: 'hiyori',
            bedtime: '01:30',
            wakeUpTime: '09:30',
            createdAt: 0,
            updatedAt: 0,
          }
    ),
  } as unknown as LifecycleRepository);
  mockNotifRepo.mockReturnValue({ listByUser } as unknown as NotificationEventRepository);
  (createPushSubscriptionRepository as jest.Mock).mockReturnValue({
    listByUser: jest.fn(async () => (extra.hasSubscription === false ? [] : [{}])),
  });
  mockSafetyRepo.mockReturnValue({
    listRecent: jest.fn(async () => []),
  } as unknown as SafetyEventRepository);
  mockStudyRepo.mockReturnValue({
    listByStatus: jest.fn(async () => []),
  } as unknown as StudyTopicRepository);
  mockMessageRepo.mockReturnValue({
    listSince: jest.fn(async () => extra.messages ?? []),
  } as unknown as MessageRepository);
  (createFreshnessCheckRequestRepository as jest.Mock).mockReturnValue({
    listByCharacter: jest.fn(async () => extra.freshnessRequests ?? []),
  });
  (createTopicRepository as jest.Mock).mockReturnValue({
    listTopicHeadersByCareDesc: jest.fn(async () => extra.topics ?? []),
    listWebFacts: jest.fn(async () => []),
  });
  const createdAt = extra.profileCreatedAt ?? null;
  mockProfileRepo.mockReturnValue({
    getById: jest.fn(async () =>
      createdAt === null ? null : { userId: 'u1', createdAt, updatedAt: createdAt, lastActiveAt: 0 }
    ),
  } as unknown as ProfileRepository);
  mockStudyUsageRepo.mockReturnValue({
    readToday: jest.fn(async () => ({
      userTotal: extra.usage?.userTotal ?? 0,
      globalTotal: extra.usage?.globalTotal ?? 12,
      characterCount: extra.usage?.characterCount ?? 0,
    })),
  } as unknown as StudyUsageRepository);
  return listByUser;
}

async function renderPage() {
  const ui = await StatusPage({ searchParams: Promise.resolve({ characterId: 'hiyori' }) });
  return renderToStaticMarkup(ui);
}

describe('StatusPage 通知の記録のキャラクター絞り込み', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Date だけを固定し、非同期処理の待ちには影響させない
    jest.useFakeTimers({
      now: NOW,
      doNotFake: [
        'nextTick',
        'setImmediate',
        'clearImmediate',
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'queueMicrotask',
        'performance',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
      ],
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('通知の記録をバッチと同じ直近 60 件で読む', async () => {
    const listByUser = setup([]);

    await renderPage();

    expect(listByUser).toHaveBeenCalledWith('u1', 60);
  });

  it('他キャラの本日の平常通知では上限到達にならず、履歴にも出ない', async () => {
    setup([makeEvent('other-1', 'ageha', NOW.getTime() - 60 * 60 * 1000)]);

    const html = await renderPage();

    expect(html).toContain('通知可能');
    expect(html).not.toContain('本日の上限到達');
    expect(html).not.toContain('本文-other-1');
    expect(html).toContain('履歴なし');
  });

  it('表示キャラの本日の平常通知は上限到達になり、他キャラ分は履歴に混ざらない', async () => {
    const at = NOW.getTime() - 60 * 60 * 1000;
    setup([makeEvent('other-1', 'ageha', at + 1000), makeEvent('own-1', 'hiyori', at)]);

    const html = await renderPage();

    expect(html).toContain('本日の上限到達');
    expect(html).toContain('本文-own-1');
    expect(html).not.toContain('本文-other-1');
  });
});

describe('StatusPage 勉強と重要通知', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({
      now: NOW,
      doNotFake: [
        'nextTick',
        'setImmediate',
        'clearImmediate',
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'queueMicrotask',
        'performance',
      ],
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const OPERATOR = ['livetalk-admin', 'livetalk-operator'];
  const setupOp = (events: Parameters<typeof setup>[0], extra: Parameters<typeof setup>[1] = {}) =>
    setup(events, { roles: OPERATOR, ...extra });

  const recentUser = () => [{ role: 'user', createdAt: NOW.getTime() - 60 * 60 * 1000 }];

  it('生活サイクルが未登録なら対象外と表示し、重要通知も判定しない', async () => {
    setupOp([], { hasLifecycle: false, messages: recentUser() });

    const html = await renderPage();

    expect(html).toContain('勉強と重要通知');
    expect(html).toContain('対象外（生活サイクル未登録）');
    expect(html).toContain('判定しない（生活サイクル未登録）');
  });

  it('購読がなければ重要通知を判定しないと表示する', async () => {
    setupOp([], { messages: recentUser(), hasSubscription: false });

    const html = await renderPage();

    expect(html).toContain('判定しない（購読なし）');
  });

  it('就寝帯なら就寝中と表示する', async () => {
    // 日本時間の 03:00
    const sleepingNow = new Date('2026-06-09T18:00:00.000Z');
    jest.setSystemTime(sleepingNow);
    setupOp([], {
      messages: [{ role: 'user', createdAt: sleepingNow.getTime() - 60 * 60 * 1000 }],
    });

    const html = await renderPage();

    expect(html).toContain('就寝中（起床後に勉強）');
  });

  it('送り済みの重要通知は、なければ「なし」、あれば件数を見出しに出す', async () => {
    setupOp([], { messages: recentUser() });
    expect(await renderPage()).toContain('送り済みの重要通知: なし');

    setupOp(
      [
        {
          ...makeEvent('c1', 'hiyori', NOW.getTime() - 1000),
          kind: 'critical' as never,
          topicId: 't1',
        } as unknown as ReturnType<typeof makeEvent>,
      ],
      { messages: recentUser() }
    );
    expect(await renderPage()).toContain('送り済みの重要通知: 1 件');
  });

  it('無料でお試しが始まっていなければ、対象外 (お試し終了) と表示する', async () => {
    setup([], { messages: recentUser() });

    const html = await renderPage();

    expect(html).toContain('対象外（お試し終了）');
  });

  it('発話がなければ勉強停止中と表示し、重要通知も判定しない', async () => {
    setupOp([]);

    const html = await renderPage();

    expect(html).toContain('勉強停止中（3 日ルール）');
    expect(html).toContain('3 日ルール: 止まっている');
    expect(html).toContain('判定しない（勉強停止中）');
  });

  it('回数の上限に達していれば本日の上限到達と表示する', async () => {
    setupOp([], {
      messages: recentUser(),
      usage: { characterCount: 20, userTotal: 20 },
    });

    const html = await renderPage();

    expect(html).toContain('3 日ルール: 止まっていない');
    expect(html).toContain('本日の上限到達');
    expect(html).toContain('判定する');
  });

  it.each([
    ['キャラ別', { characterCount: 20, userTotal: 0, globalTotal: 0 }],
    ['あなたの合計', { characterCount: 0, userTotal: 20, globalTotal: 0 }],
    ['全利用者', { characterCount: 0, userTotal: 0, globalTotal: 200 }],
  ])('上限に達した枠 (%s) を、本日の上限到達に添えて表示する', async (scope, usage) => {
    setupOp([], { messages: recentUser(), usage });

    const html = await renderPage();

    expect(html).toContain(`本日の上限到達（${scope}）`);
  });

  it('利用者の合計の行は勉強と重要通知から外し、勉強の節にだけ出す', async () => {
    setupOp([], { messages: recentUser(), usage: { userTotal: 7, globalTotal: 30 } });

    const html = await renderPage();

    expect(html).not.toContain('全キャラ合計');
    expect(html).toContain('今日の回数 (あなた): 7 / 20');
    expect(html).toContain('今日の回数 (全利用者): 30 / 200');
  });

  it('勉強中は回数・依頼待ち・判定に渡る候補を表示する', async () => {
    setupOp([], {
      messages: recentUser(),
      usage: { characterCount: 0, userTotal: 0 },
      topics: [{ topicId: 'topic-1', subject: '来週のライブ', care: 5 }],
      freshnessRequests: [{ topicId: 'topic-9', createdAt: NOW.getTime() - 1000 }],
    });

    const html = await renderPage();

    expect(html).toContain('勉強中');
    expect(html).toContain('判定する');
    expect(html).toContain('topic-1 | 来週のライブ | care 5');
    expect(html).toContain('鮮度確認の依頼待ち: 1 件');
    expect(html).toContain('topic-9');
  });
});

describe('StatusPage 勉強の節', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(NOW);
  });
  afterEach(() => jest.useRealTimers());

  it('区分・お試し・今日の回数を出し、上限に達していればそうとわかる', async () => {
    setup([]);
    const html = await renderPage();

    expect(html).toContain('区分: 無料');
    expect(html).toContain('お試し: まだ始まっていない');
    expect(html).toContain('今日の回数 (あなた): 0 / 0 (上限に達している)');
    expect(html).toContain('今日の回数 (全利用者): 12 / 200');
    expect(html).not.toContain('今日の回数 (全利用者): 12 / 200 (');
  });

  it('既存の勉強の待ち件数は変えない', async () => {
    setup([]);
    expect(await renderPage()).toContain('STUDY_TOPIC (pending): 0 件');
  });
});
