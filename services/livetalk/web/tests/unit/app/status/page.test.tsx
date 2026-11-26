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
  createSafetyEventRepository,
  createStudyTopicRepository,
  createMessageRepository,
  createStudyUsageRepository,
  createFreshnessCheckRequestRepository,
  createTopicRepository,
} from '@nagiyu/livetalk-core';
import type {
  LifecycleRepository,
  NotificationEventRepository,
  SafetyEventRepository,
  StudyTopicRepository,
  MessageRepository,
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
  createSafetyEventRepository: jest.fn(),
  createStudyTopicRepository: jest.fn(),
  createMessageRepository: jest.fn(),
  createStudyUsageRepository: jest.fn(),
  createFreshnessCheckRequestRepository: jest.fn(),
  createTopicRepository: jest.fn(),
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
    usage?: { characterCount: number; totalCount: number };
    topics?: { topicId: string; subject: string; care: number }[];
    freshnessRequests?: { topicId: string; createdAt: number }[];
  } = {}
) {
  const listByUser = jest.fn(async () => events);
  mockGetSession.mockResolvedValue(adminSession);
  mockLifecycleRepo.mockReturnValue({
    get: jest.fn(async () => ({
      userId: 'u1',
      characterId: 'hiyori',
      bedtime: '01:30',
      wakeUpTime: '09:30',
      createdAt: 0,
      updatedAt: 0,
    })),
  } as unknown as LifecycleRepository);
  mockNotifRepo.mockReturnValue({ listByUser } as unknown as NotificationEventRepository);
  mockSafetyRepo.mockReturnValue({
    listRecent: jest.fn(async () => []),
  } as unknown as SafetyEventRepository);
  mockStudyRepo.mockReturnValue({
    listByStatus: jest.fn(async () => []),
  } as unknown as StudyTopicRepository);
  mockMessageRepo.mockReturnValue({
    listSince: jest.fn(async () => extra.messages ?? []),
  } as unknown as MessageRepository);
  (createStudyUsageRepository as jest.Mock).mockReturnValue({
    readUsage: jest.fn(async () => extra.usage ?? { characterCount: 0, totalCount: 0 }),
  });
  (createFreshnessCheckRequestRepository as jest.Mock).mockReturnValue({
    listByCharacter: jest.fn(async () => extra.freshnessRequests ?? []),
  });
  (createTopicRepository as jest.Mock).mockReturnValue({
    listTopicHeadersByCareDesc: jest.fn(async () => extra.topics ?? []),
    listWebFacts: jest.fn(async () => []),
  });
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

  it('発話がなければ勉強停止中と判定しないことを表示する', async () => {
    setup([]);

    const html = await renderPage();

    expect(html).toContain('勉強と重要通知');
    expect(html).toContain('勉強停止中');
    expect(html).toContain('上限到達');
    expect(html).toContain('判定しない（勉強停止中）');
  });

  it('勉強中は回数・依頼待ち・判定に渡る候補を表示する', async () => {
    setup([], {
      messages: [{ role: 'user', createdAt: NOW.getTime() - 60 * 60 * 1000 }],
      usage: { characterCount: 2, totalCount: 4 },
      topics: [{ topicId: 'topic-1', subject: '来週のライブ', care: 5 }],
      freshnessRequests: [{ topicId: 'topic-9', createdAt: NOW.getTime() - 1000 }],
    });

    const html = await renderPage();

    expect(html).toContain('勉強中');
    expect(html).toContain('上限内');
    expect(html).toContain('判定する');
    expect(html).toContain('topic-1 | 来週のライブ | care 5');
    expect(html).toContain('鮮度確認の依頼待ち: 1 件');
    expect(html).toContain('topic-9');
  });
});
