import type { LifecycleEntity } from '../../../src/entities/lifecycle.entity.js';
import { shouldStudyNow, studyForUser } from '../../../src/usecases/study.usecase.js';
import type { KnowledgeRepository } from '../../../src/repositories/knowledge.repository.interface.js';
import type { InterestRepository } from '../../../src/repositories/interest.repository.interface.js';
import type { StudyTopicRepository } from '../../../src/repositories/study-topic.repository.interface.js';
import type { StudyTopicEntity } from '../../../src/entities/study-topic.entity.js';
import type { IResearchClient } from '../../../src/research/types.js';
import type { CharacterDefinition } from '../../../src/characters/types.js';
import { STUDY_MIN_INTERVAL_HOURS, STUDY_MIN_SUMMARY_LENGTH } from '../../../src/constants.js';

const makeLifecycle = (overrides: Partial<LifecycleEntity> = {}): LifecycleEntity => ({
  UserID: 'u1',
  CharacterID: 'hiyori',
  Bedtime: '01:30',
  WakeUpTime: '09:30',
  CreatedAt: 1_700_000_000_000,
  UpdatedAt: 1_700_000_000_000,
  ...overrides,
});

const character: CharacterDefinition = {
  id: 'hiyori',
  displayName: '桃瀬ひより',
  // notificationName は通知タイトル用のカジュアル名（必須フィールド）
  notificationName: 'ひより',
  personality: {
    basePrompt: '',
    speechStyle: '優しい口調',
    preferences: { likes: ['コーヒー'], dislikes: [] },
  },
  voiceConfig: { provider: 'voicevox' as const, speakerId: 14 },
  license: { displayText: '', creditName: '' },
};

describe('shouldStudyNow', () => {
  // 14:00 ローカル時刻（起床中 = Bedtime 01:30〜WakeUpTime 09:30 以外、ピーク外）
  const awakeNonPeak = new Date(2026, 5, 1, 14, 0, 0);

  it('起床中かつ非ピーク時間は true', () => {
    const result = shouldStudyNow(makeLifecycle(), undefined, awakeNonPeak);
    expect(result.result).toBe(true);
  });

  it('就寝中は false', () => {
    // 03:00 ローカル時刻 = 就寝時間（Bedtime 01:30〜WakeUpTime 09:30）
    const sleeping = new Date(2026, 4, 31, 3, 0, 0);
    const result = shouldStudyNow(makeLifecycle(), undefined, sleeping);
    expect(result.result).toBe(false);
    expect(result.reason).toContain('就寝中');
  });

  it('ピーク活動時間帯はスキップ', () => {
    const lifecycle = makeLifecycle({
      UserActivityProfile: {
        morningPeak: '14:00',
        eveningPeak: '21:00',
        sampleSize: 10,
        lastLearnedAt: '2026-06-01T00:00:00Z',
      },
    });
    // 14:00 ローカル時刻 は morningPeak '14:00' の ±2 時間内なのでスキップ
    const result = shouldStudyNow(lifecycle, undefined, awakeNonPeak);
    expect(result.result).toBe(false);
    expect(result.reason).toContain('ピーク');
  });

  it('前回勉強から STUDY_MIN_INTERVAL_HOURS 未満はスキップ', () => {
    const nowMs = awakeNonPeak.getTime();
    const recentStudy = nowMs - (STUDY_MIN_INTERVAL_HOURS - 1) * 60 * 60 * 1000;
    const result = shouldStudyNow(makeLifecycle(), recentStudy, awakeNonPeak);
    expect(result.result).toBe(false);
  });

  it('前回勉強から STUDY_MIN_INTERVAL_HOURS 以上経過していれば true', () => {
    const nowMs = awakeNonPeak.getTime();
    const oldStudy = nowMs - (STUDY_MIN_INTERVAL_HOURS + 1) * 60 * 60 * 1000;
    const result = shouldStudyNow(makeLifecycle(), oldStudy, awakeNonPeak);
    expect(result.result).toBe(true);
  });

  it('UserActivityProfile がない場合はピーク判定をスキップ', () => {
    const lifecycle = makeLifecycle({ UserActivityProfile: undefined });
    const result = shouldStudyNow(lifecycle, undefined, awakeNonPeak);
    expect(result.result).toBe(true);
  });
});

describe('studyForUser', () => {
  // 14:00 ローカル時刻（起床中）
  const awakeNonPeak = new Date(2026, 5, 1, 14, 0, 0);

  const makeKnowledgeRepo = (): jest.Mocked<KnowledgeRepository> => ({
    put: jest.fn().mockImplementation(async (input) => ({ ...input, CreatedAt: Date.now() })),
    list: jest.fn().mockResolvedValue([]),
    getLatest: jest.fn().mockResolvedValue(null),
    getById: jest.fn().mockResolvedValue(null),
  });

  const makeInterestRepo = (): jest.Mocked<InterestRepository> => ({
    get: jest.fn(),
    list: jest.fn().mockResolvedValue([
      {
        UserID: 'u1',
        CharacterID: 'hiyori',
        Category: 'コーヒー',
        Weight: 10,
        CreatedAt: 0,
        UpdatedAt: 0,
      },
    ]),
    put: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  });

  const makeResearchClient = (): jest.Mocked<IResearchClient> => ({
    research: jest.fn().mockResolvedValue({
      topic: 'コーヒーの効能',
      summary: 'コーヒーには多くの健康効果があります。'.repeat(5),
      sourceUrls: ['https://example.com'],
      rawComment: '美味しいね！',
    }),
  });

  it('実施判定が通れば研究が実行される', async () => {
    const knowledgeRepo = makeKnowledgeRepo();
    const interestRepo = makeInterestRepo();
    const researchClient = makeResearchClient();

    const result = await studyForUser('u1', 'hiyori', {
      knowledgeRepo,
      interestRepo,
      researchClient,
      character,
      lifecycle: makeLifecycle(),
      ulidFactory: () => 'test-ulid',
      now: () => awakeNonPeak,
    });

    expect(result.outcome).toBe('studied');
    expect(result.savedCount).toBeGreaterThan(0);
    expect(knowledgeRepo.put).toHaveBeenCalled();
  });

  it('就寝中はスキップ', async () => {
    // 03:00 ローカル時刻 = 就寝中
    const sleeping = new Date(2026, 4, 31, 3, 0, 0);
    const result = await studyForUser('u1', 'hiyori', {
      knowledgeRepo: makeKnowledgeRepo(),
      interestRepo: makeInterestRepo(),
      researchClient: makeResearchClient(),
      character,
      lifecycle: makeLifecycle(),
      now: () => sleeping,
    });
    expect(result.outcome).toBe('skipped');
  });

  it('興味カテゴリが空ならスキップ', async () => {
    const interestRepo = makeInterestRepo();
    interestRepo.list.mockResolvedValue([]);

    const result = await studyForUser('u1', 'hiyori', {
      knowledgeRepo: makeKnowledgeRepo(),
      interestRepo,
      researchClient: makeResearchClient(),
      character,
      lifecycle: makeLifecycle(),
      now: () => awakeNonPeak,
    });
    expect(result.outcome).toBe('skipped');
  });

  it(`要約が ${STUDY_MIN_SUMMARY_LENGTH} 文字未満の場合は保存しない`, async () => {
    const researchClient = makeResearchClient();
    researchClient.research.mockResolvedValue({
      topic: 'トピック',
      summary: '短い',
      sourceUrls: [],
      rawComment: 'コメント',
    });

    const knowledgeRepo = makeKnowledgeRepo();
    await studyForUser('u1', 'hiyori', {
      knowledgeRepo,
      interestRepo: makeInterestRepo(),
      researchClient,
      character,
      lifecycle: makeLifecycle(),
      now: () => awakeNonPeak,
    });

    expect(knowledgeRepo.put).not.toHaveBeenCalled();
  });

  // ── STUDY_TOPIC 優先処理（Phase 5b）──

  const makeStudyTopicRepo = (
    topics: StudyTopicEntity[] = []
  ): jest.Mocked<StudyTopicRepository> => ({
    put: jest.fn().mockImplementation(async (input) => ({
      ...input,
      CreatedAt: Date.now(),
      UpdatedAt: Date.now(),
    })),
    listByStatus: jest.fn().mockResolvedValue(topics),
    updateStatus: jest.fn().mockImplementation(async (input) => ({
      ...input,
      CreatedAt: Date.now(),
      UpdatedAt: Date.now(),
    })),
    findPendingByTopic: jest.fn().mockResolvedValue(null),
  });

  const makePendingStudyTopic = (overrides: Partial<StudyTopicEntity> = {}): StudyTopicEntity => ({
    UserID: 'u1',
    CharacterID: 'hiyori',
    TopicID: 'tp1',
    Topic: '最新アニメ',
    Priority: 10,
    Status: 'pending',
    CreatedAt: 1_700_000_000_000,
    UpdatedAt: 1_700_000_000_000,
    ...overrides,
  });

  it('STUDY_TOPIC が pending なら優先的に研究される', async () => {
    const topic = makePendingStudyTopic({ Topic: '最新アニメ情報' });
    const studyTopicRepo = makeStudyTopicRepo([topic]);
    const knowledgeRepo = makeKnowledgeRepo();
    const interestRepo = makeInterestRepo();
    interestRepo.list.mockResolvedValue([]); // 興味カテゴリは空
    const researchClient = makeResearchClient();
    researchClient.research.mockResolvedValue({
      topic: '最新アニメ情報',
      summary: '最新アニメに関する詳細情報です。'.repeat(5),
      sourceUrls: ['https://example.com'],
      rawComment: '面白そう！',
    });

    const result = await studyForUser('u1', 'hiyori', {
      knowledgeRepo,
      interestRepo,
      researchClient,
      character,
      lifecycle: makeLifecycle(),
      now: () => awakeNonPeak,
      studyTopicRepo,
    });

    expect(result.outcome).toBe('studied');
    expect(result.savedCount).toBe(1);
    expect(knowledgeRepo.put).toHaveBeenCalledWith(
      expect.objectContaining({ Topic: '最新アニメ情報' })
    );
    // Status が done になる
    expect(studyTopicRepo.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ TopicID: 'tp1', Status: 'done' })
    );
  });

  it('STUDY_TOPIC を優先して残り枠で通常カテゴリを処理する', async () => {
    const topic = makePendingStudyTopic({ Topic: '優先トピック' });
    const studyTopicRepo = makeStudyTopicRepo([topic]);
    const knowledgeRepo = makeKnowledgeRepo();
    const interestRepo = makeInterestRepo(); // コーヒーカテゴリあり
    const researchClient = makeResearchClient();
    researchClient.research
      .mockResolvedValueOnce({
        topic: '優先トピック',
        summary: '優先トピックの詳細情報。'.repeat(5),
        sourceUrls: [],
        rawComment: '',
      })
      .mockResolvedValueOnce({
        topic: 'コーヒーの効能',
        summary: 'コーヒーに関する情報。'.repeat(5),
        sourceUrls: [],
        rawComment: '',
      });

    const result = await studyForUser('u1', 'hiyori', {
      knowledgeRepo,
      interestRepo,
      researchClient,
      character,
      lifecycle: makeLifecycle(),
      now: () => awakeNonPeak,
      studyTopicRepo,
      maxQueriesPerRun: 3,
    });

    expect(result.outcome).toBe('studied');
    expect(result.savedCount).toBe(2);
  });

  it('STUDY_TOPIC 研究が品質不足の場合は done にするが savedCount は増えない', async () => {
    const topic = makePendingStudyTopic();
    const studyTopicRepo = makeStudyTopicRepo([topic]);
    const knowledgeRepo = makeKnowledgeRepo();
    const interestRepo = makeInterestRepo();
    interestRepo.list.mockResolvedValue([]);
    const researchClient = makeResearchClient();
    researchClient.research.mockResolvedValue({
      topic: '最新アニメ',
      summary: '短い',
      sourceUrls: [],
      rawComment: '',
    });

    await studyForUser('u1', 'hiyori', {
      knowledgeRepo,
      interestRepo,
      researchClient,
      character,
      lifecycle: makeLifecycle(),
      now: () => awakeNonPeak,
      studyTopicRepo,
    });

    expect(knowledgeRepo.put).not.toHaveBeenCalled();
    expect(studyTopicRepo.updateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ Status: 'done' })
    );
  });

  it('studyTopicRepo 未指定でも通常フローが動く（後方互換）', async () => {
    const knowledgeRepo = makeKnowledgeRepo();
    const interestRepo = makeInterestRepo();
    const researchClient = makeResearchClient();

    const result = await studyForUser('u1', 'hiyori', {
      knowledgeRepo,
      interestRepo,
      researchClient,
      character,
      lifecycle: makeLifecycle(),
      now: () => awakeNonPeak,
      // studyTopicRepo は未指定
    });

    expect(result.outcome).toBe('studied');
    expect(knowledgeRepo.put).toHaveBeenCalled();
  });

  it('リサーチ失敗でも他カテゴリを継続する（fail-warn）', async () => {
    const interestRepo = makeInterestRepo();
    interestRepo.list.mockResolvedValue([
      {
        UserID: 'u1',
        CharacterID: 'hiyori',
        Category: 'コーヒー',
        Weight: 10,
        CreatedAt: 0,
        UpdatedAt: 0,
      },
      {
        UserID: 'u1',
        CharacterID: 'hiyori',
        Category: 'アニメ',
        Weight: 5,
        CreatedAt: 0,
        UpdatedAt: 0,
      },
    ]);

    const researchClient = makeResearchClient();
    researchClient.research.mockRejectedValueOnce(new Error('API エラー')).mockResolvedValueOnce({
      topic: 'アニメの話題',
      summary: 'アニメに関する情報です。'.repeat(5),
      sourceUrls: [],
      rawComment: '面白そう！',
    });

    const knowledgeRepo = makeKnowledgeRepo();
    const result = await studyForUser('u1', 'hiyori', {
      knowledgeRepo,
      interestRepo,
      researchClient,
      character,
      lifecycle: makeLifecycle(),
      ulidFactory: () => 'test-ulid',
      now: () => awakeNonPeak,
    });

    expect(result.outcome).toBe('studied');
    expect(knowledgeRepo.put).toHaveBeenCalledTimes(1);
  });
});
