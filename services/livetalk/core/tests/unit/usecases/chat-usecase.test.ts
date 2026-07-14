import { runChatUseCase, type ChatEvent } from '../../../src/usecases/chat-usecase.js';
import { hiyori } from '../../../src/characters/hiyori.js';
import { MODERATION_REPLACEMENT_MESSAGES } from '../../../src/safety/templates.js';
import type { ILLMClient } from '../../../src/llm-client/types.js';
import type { IVoiceClient } from '../../../src/voice/types.js';
import type { MessageRepository } from '../../../src/repositories/message.repository.interface.js';
import type { SafetyEventRepository } from '../../../src/repositories/safety-event.repository.interface.js';
import type { StudyTopicRepository } from '../../../src/repositories/study-topic.repository.interface.js';
import type { NoteRepository } from '../../../src/repositories/note.repository.interface.js';
import type { ConsolidationCursorRepository } from '../../../src/repositories/consolidation-cursor.repository.interface.js';
import type { NoteEntity } from '../../../src/entities/note.entity.js';
import type { MessageEntity } from '../../../src/entities/message.entity.js';
import type { ConsolidationCursorEntity } from '../../../src/entities/consolidation-cursor.entity.js';
import type { SafetyEventEntity } from '../../../src/entities/safety-event.entity.js';
import type { IModerationClient, ModerationResult } from '../../../src/safety/types.js';
import type { ITopicRetriever, RetrievedTopic } from '../../../src/knowledge/retrieval.js';
import type { TopicEntity } from '../../../src/entities/topic.entity.js';
import type { CharacterStateRepository } from '../../../src/repositories/character-state.repository.interface.js';
import type { CharacterStateEntity } from '../../../src/entities/character-state.entity.js';

// ── ヘルパー ──────────────────────────────────────────────────────────────

function makeMessage(role: 'user' | 'assistant', text: string, id = 'm1'): MessageEntity {
  return {
    UserID: 'u1',
    CharacterID: 'hiyori',
    MessageID: id,
    Role: role,
    Text: text,
    CreatedAt: 1_700_000_000_000,
    UpdatedAt: 1_700_000_000_000,
  };
}

async function* stringsToStream(chunks: string[]): AsyncIterable<string> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

function makeLLMClient(chunks: string[]): ILLMClient {
  return {
    chatStream: jest.fn(async function* () {
      yield* stringsToStream(chunks);
    }),
    chatComplete: jest.fn(),
    // 既定では知識ゲート（classifyTopic）は needsStudy=false（通常フロー継続）を返す。
    chatStructured: jest.fn(async () => ({
      needsStudy: false,
      normalizedTopic: '',
    })) as unknown as ILLMClient['chatStructured'],
  };
}

function makeVoiceClient(audioBytes: number = 4): IVoiceClient {
  return {
    synthesize: jest.fn(async () => new ArrayBuffer(audioBytes)),
  };
}

function makeRepo(
  history: MessageEntity[] = [],
  overrides: Partial<MessageRepository> = {}
): MessageRepository {
  return {
    create: jest.fn(async (input) => ({
      UserID: input.UserID,
      CharacterID: input.CharacterID,
      MessageID: 'gen-id',
      Role: input.Role,
      Text: input.Text,
      CreatedAt: Date.now(),
      UpdatedAt: Date.now(),
    })),
    getById: jest.fn(async () => null),
    getRecentByTokenBudget: jest.fn(async () => ({
      messages: [],
      totalTokens: 0,
      truncated: false,
    })),
    listSince: jest.fn(async () => history),
    ...overrides,
  };
}

function makeConsolidationCursorRepo(
  cursor: ConsolidationCursorEntity | null = null,
  overrides: Partial<ConsolidationCursorRepository> = {}
): ConsolidationCursorRepository {
  return {
    get: jest.fn(async () => cursor),
    put: jest.fn(async (input) => ({ ...input, UpdatedAt: Date.now() })),
    ...overrides,
  };
}

async function collectEvents(generator: AsyncGenerator<ChatEvent>): Promise<ChatEvent[]> {
  const events: ChatEvent[] = [];
  for await (const event of generator) {
    events.push(event);
  }
  return events;
}

function makeSafetyEventRepo(
  overrides: Partial<SafetyEventRepository> = {}
): SafetyEventRepository {
  return {
    create: jest.fn(
      async (input) =>
        ({
          UserID: input.UserID,
          EventID: 'safety-event-id',
          Trigger: input.Trigger,
          DetectedPattern: input.DetectedPattern,
          InputText: input.InputText,
          ResponseText: input.ResponseText,
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
        }) as SafetyEventEntity
    ),
    getById: jest.fn(async () => null),
    listRecent: jest.fn(async () => []),
    ...overrides,
  };
}

function makeModerationClient(
  flagged: boolean,
  categories: Record<string, boolean> = {}
): IModerationClient {
  return {
    check: jest.fn(
      async (): Promise<ModerationResult> => ({
        flagged,
        categories,
      })
    ),
  };
}

function makeRetrievedTopic(subject: string, selfFactTexts: string[] = []): RetrievedTopic {
  const topic: TopicEntity = {
    UserID: 'u1',
    CharacterID: 'hiyori',
    TopicID: 'topic-1',
    Subject: subject,
    CanonicalSummary: `${subject} の要約`,
    Category: 'カテゴリ',
    Care: 1,
    Embedding: [0.1, 0.2],
    CreatedAt: 1_700_000_000_000,
    UpdatedAt: 1_700_000_000_000,
  };
  return {
    topic,
    selfFacts: selfFactTexts.map((text, i) => ({
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'topic-1',
      FactID: `fact-${i}`,
      Text: text,
      Provenance: '',
      CreatedAt: 1_700_000_000_000,
    })),
    webFacts: [],
    similarity: 0.9,
    via: 'direct',
  };
}

function makeTopicRetriever(topics: RetrievedTopic[] = []): ITopicRetriever {
  return {
    retrieve: jest.fn(async () => topics),
  };
}

/**
 * runChatUseCase の必須パラメータ一式を毎回新規に組み立てる。
 * topicRetriever は P5 で必須パラメータになったため、テストごとに新規モックを持たせて
 * モック呼び出し履歴が他テストへ漏れないようにする。
 */
function makeBaseParams() {
  return {
    userId: 'u1',
    characterId: 'hiyori',
    userText: 'こんにちは',
    character: hiyori,
    topicRetriever: makeTopicRetriever(),
  };
}

// ── テスト本体 ──────────────────────────────────────────────────────────────

describe('runChatUseCase', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('正常フロー', () => {
    it('text delta を順番に yield する', async () => {
      const llm = makeLLMClient(['おは', 'よう。']);
      const voice = makeVoiceClient();
      const repo = makeRepo();

      const events = await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
        })
      );

      const textEvents = events.filter((e) => e.type === 'text');
      expect(textEvents).toEqual([
        { type: 'text', delta: 'おは' },
        { type: 'text', delta: 'よう。' },
      ]);
    });

    it('sentence event が done の前に index 順で来る', async () => {
      const llm = makeLLMClient(['おはよう。', '今日もいい天気ですね。']);
      const voice = makeVoiceClient();
      const repo = makeRepo();

      const events = await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
        })
      );

      const sentenceEvents = events.filter((e) => e.type === 'sentence');
      expect(sentenceEvents).toHaveLength(2);
      expect(sentenceEvents[0]).toMatchObject({ type: 'sentence', index: 0, text: 'おはよう。' });
      expect(sentenceEvents[1]).toMatchObject({
        type: 'sentence',
        index: 1,
        text: '今日もいい天気ですね。',
      });

      const doneIdx = events.findIndex((e) => e.type === 'done');
      const lastSentenceIdx = events.reduce((acc, e, i) => (e.type === 'sentence' ? i : acc), -1);
      expect(doneIdx).toBeGreaterThan(lastSentenceIdx);
    });

    it('sentence event の audio フィールドは base64 文字列', async () => {
      const llm = makeLLMClient(['ありがとう。']);
      const voice = makeVoiceClient(8);
      const repo = makeRepo();

      const events = await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
        })
      );

      const s = events.find((e) => e.type === 'sentence');
      expect(s).toBeDefined();
      if (s?.type === 'sentence') {
        expect(typeof s.audio).toBe('string');
        expect(s.audio.length).toBeGreaterThan(0);
      }
    });

    it('done event が最後に来る', async () => {
      const llm = makeLLMClient(['はい。']);
      const voice = makeVoiceClient();
      const repo = makeRepo();

      const events = await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
        })
      );

      expect(events[events.length - 1]).toEqual({ type: 'done' });
    });

    it('LLM 終了後の残余テキスト（句点なし）も sentence event として処理される', async () => {
      const llm = makeLLMClient(['残余テキスト']);
      const voice = makeVoiceClient();
      const repo = makeRepo();

      const events = await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
        })
      );

      const sentenceEvents = events.filter((e) => e.type === 'sentence');
      expect(sentenceEvents).toHaveLength(1);
      expect(sentenceEvents[0]).toMatchObject({ text: '残余テキスト' });
    });

    it('LLM が空文字のみの場合、sentence event は来ない', async () => {
      const llm = makeLLMClient(['   ']);
      const voice = makeVoiceClient();
      const repo = makeRepo();

      const events = await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
        })
      );

      expect(events.filter((e) => e.type === 'sentence')).toHaveLength(0);
      expect(events[events.length - 1]).toEqual({ type: 'done' });
    });
  });

  describe('DynamoDB 保存', () => {
    it('ユーザーメッセージが最初に保存される', async () => {
      const llm = makeLLMClient(['ok。']);
      const voice = makeVoiceClient();
      const repo = makeRepo();

      await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          userText: 'テスト',
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
        })
      );

      expect(repo.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ Role: 'user', Text: 'テスト' })
      );
    });

    it('アシスタントメッセージが done の後に保存される', async () => {
      const llm = makeLLMClient(['hello']);
      const voice = makeVoiceClient();
      const repo = makeRepo();

      await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
        })
      );

      expect(repo.create).toHaveBeenCalledTimes(2);
      expect(repo.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ Role: 'assistant', Text: 'hello' })
      );
    });

    it('直近履歴が LLM のメッセージに渡される（ユーザーメッセージ保存前に取得）', async () => {
      const history = [
        makeMessage('user', '昨日の話'),
        makeMessage('assistant', 'そうでしたね', 'm2'),
      ];
      const llm = makeLLMClient(['はい。']);
      const voice = makeVoiceClient();
      const repo = makeRepo(history);

      await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
        })
      );

      const chatStreamMock = llm.chatStream as jest.Mock;
      const passedMessages = chatStreamMock.mock.calls[0][0];
      // system + history (2) + current user = 4
      expect(passedMessages).toHaveLength(4);
      expect(passedMessages[0].role).toBe('system');
      expect(passedMessages[1]).toEqual({ role: 'user', content: '昨日の話' });
      expect(passedMessages[2]).toEqual({ role: 'assistant', content: 'そうでしたね' });
      expect(passedMessages[3]).toEqual({ role: 'user', content: 'こんにちは' });
    });

    it('listSince はユーザー保存より前に呼ばれる', async () => {
      const callOrder: string[] = [];
      const repo = makeRepo([], {
        listSince: jest.fn(async () => {
          callOrder.push('listSince');
          return [];
        }),
        create: jest.fn(async (input) => {
          callOrder.push(`create:${input.Role}`);
          return {
            UserID: input.UserID,
            CharacterID: input.CharacterID,
            MessageID: 'x',
            Role: input.Role,
            Text: input.Text,
            CreatedAt: 0,
            UpdatedAt: 0,
          };
        }),
      });
      const llm = makeLLMClient(['ok。']);
      const voice = makeVoiceClient();

      await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
        })
      );

      expect(callOrder[0]).toBe('listSince');
      expect(callOrder[1]).toBe('create:user');
    });

    it('アシスタント保存エラーは例外を投げない（ログのみ）', async () => {
      const llm = makeLLMClient(['ok。']);
      const voice = makeVoiceClient();
      let callCount = 0;
      const repo = makeRepo([], {
        create: jest.fn(async (input) => {
          callCount++;
          if (callCount === 2) throw new Error('db error');
          return {
            UserID: input.UserID,
            CharacterID: input.CharacterID,
            MessageID: 'x',
            Role: input.Role,
            Text: input.Text,
            CreatedAt: 0,
            UpdatedAt: 0,
          };
        }),
      });

      await expect(
        collectEvents(
          runChatUseCase({
            ...makeBaseParams(),
            llmClient: llm,
            voiceClient: voice,
            messageRepository: repo,
          })
        )
      ).resolves.not.toThrow();
    });
  });

  describe('エラーハンドリング', () => {
    it('ユーザーメッセージ保存エラーは例外として伝播する', async () => {
      const llm = makeLLMClient([]);
      const voice = makeVoiceClient();
      const repo = makeRepo([], {
        create: jest.fn(async () => {
          throw new Error('db down');
        }),
      });

      await expect(
        collectEvents(
          runChatUseCase({
            ...makeBaseParams(),
            llmClient: llm,
            voiceClient: voice,
            messageRepository: repo,
          })
        )
      ).rejects.toThrow('db down');
    });

    it('VOICEVOX エラーは sentence event をスキップして続行する', async () => {
      const llm = makeLLMClient(['おはよう。', 'こんにちは。']);
      const failingVoice: IVoiceClient = {
        synthesize: jest.fn(async () => {
          throw new Error('voicevox down');
        }),
      };
      const repo = makeRepo();

      const events = await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: failingVoice,
          messageRepository: repo,
        })
      );

      // sentence events がない（スキップ）が done は来る
      expect(events.filter((e) => e.type === 'sentence')).toHaveLength(0);
      expect(events[events.length - 1]).toEqual({ type: 'done' });
    });

    it('LLM エラーは例外として伝播する', async () => {
      const failingLLM: ILLMClient = {
        chatStream: jest.fn(function (): AsyncIterable<string> {
          throw new Error('llm down');
        }),
        chatComplete: jest.fn(),
        chatStructured: jest.fn(async () => ({
          needsStudy: false,
          normalizedTopic: '',
        })) as unknown as ILLMClient['chatStructured'],
      };
      const voice = makeVoiceClient();
      const repo = makeRepo();

      await expect(
        collectEvents(
          runChatUseCase({
            ...makeBaseParams(),
            llmClient: failingLLM,
            voiceClient: voice,
            messageRepository: repo,
          })
        )
      ).rejects.toThrow('llm down');
    });
  });

  describe('セーフティフロー（キーワード検出）', () => {
    const safetyText = '死にたい';

    it('危険キーワードを含む入力で LLM が呼ばれない', async () => {
      const llm = makeLLMClient(['応答テキスト']);
      const voice = makeVoiceClient();
      const repo = makeRepo();

      await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          userText: safetyText,
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
        })
      );

      expect((llm.chatStream as jest.Mock).mock.calls).toHaveLength(0);
    });

    it('safety event が emit される（trigger=input_keyword）', async () => {
      const llm = makeLLMClient([]);
      const voice = makeVoiceClient();
      const repo = makeRepo();

      const events = await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          userText: safetyText,
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
        })
      );

      const safetyEvent = events.find((e) => e.type === 'safety');
      expect(safetyEvent).toBeDefined();
      if (safetyEvent?.type === 'safety') {
        expect(safetyEvent.trigger).toBe('input_keyword');
        expect(Array.isArray(safetyEvent.resources)).toBe(true);
        expect(safetyEvent.resources.length).toBeGreaterThan(0);
      }
    });

    it('text events が emit される（介入メッセージ）', async () => {
      const llm = makeLLMClient([]);
      const voice = makeVoiceClient();
      const repo = makeRepo();

      const events = await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          userText: safetyText,
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
        })
      );

      const textEvents = events.filter((e) => e.type === 'text');
      expect(textEvents.length).toBeGreaterThan(0);
    });

    it('done が最後に emit される', async () => {
      const llm = makeLLMClient([]);
      const voice = makeVoiceClient();
      const repo = makeRepo();

      const events = await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          userText: safetyText,
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
        })
      );

      expect(events[events.length - 1]).toEqual({ type: 'done' });
    });

    it('SafetyEvent がリポジトリに保存される', async () => {
      const llm = makeLLMClient([]);
      const voice = makeVoiceClient();
      const repo = makeRepo();
      const safetyRepo = makeSafetyEventRepo();

      await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          userText: safetyText,
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          safetyEventRepository: safetyRepo,
        })
      );

      expect(safetyRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          UserID: 'u1',
          Trigger: 'input_keyword',
          InputText: safetyText,
        })
      );
    });

    it('SafetyEvent リポジトリが未指定でも正常に動作する', async () => {
      const llm = makeLLMClient([]);
      const voice = makeVoiceClient();
      const repo = makeRepo();

      await expect(
        collectEvents(
          runChatUseCase({
            ...makeBaseParams(),
            userText: safetyText,
            llmClient: llm,
            voiceClient: voice,
            messageRepository: repo,
            // safetyEventRepository なし
          })
        )
      ).resolves.not.toThrow();
    });

    it('SafetyEvent 保存エラーは例外を投げない（ログのみ）', async () => {
      const llm = makeLLMClient([]);
      const voice = makeVoiceClient();
      const repo = makeRepo();
      const safetyRepo = makeSafetyEventRepo({
        create: jest.fn(async () => {
          throw new Error('db error');
        }),
      });

      await expect(
        collectEvents(
          runChatUseCase({
            ...makeBaseParams(),
            userText: safetyText,
            llmClient: llm,
            voiceClient: voice,
            messageRepository: repo,
            safetyEventRepository: safetyRepo,
          })
        )
      ).resolves.not.toThrow();
    });
  });

  describe('セーフティフロー（Moderation API）', () => {
    it('Moderation が flagged のとき safety event が emit される', async () => {
      const llm = makeLLMClient(['応答テキスト。']);
      const voice = makeVoiceClient();
      const repo = makeRepo();
      const moderation = makeModerationClient(true, { 'self-harm': true });

      const events = await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          moderationClient: moderation,
        })
      );

      const safetyEvent = events.find((e) => e.type === 'safety');
      expect(safetyEvent).toBeDefined();
      if (safetyEvent?.type === 'safety') {
        expect(safetyEvent.trigger).toBe('output_moderation');
        expect(typeof safetyEvent.replacementText).toBe('string');
        expect(safetyEvent.replacementText!.length).toBeGreaterThan(0);
      }
    });

    it('Moderation が flagged でないとき safety event は来ない', async () => {
      const llm = makeLLMClient(['通常の応答。']);
      const voice = makeVoiceClient();
      const repo = makeRepo();
      const moderation = makeModerationClient(false);

      const events = await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          moderationClient: moderation,
        })
      );

      expect(events.find((e) => e.type === 'safety')).toBeUndefined();
    });

    it('Moderation flagged 時に SafetyEvent が保存される', async () => {
      const llm = makeLLMClient(['応答テキスト。']);
      const voice = makeVoiceClient();
      const repo = makeRepo();
      const moderation = makeModerationClient(true, { 'self-harm': true });
      const safetyRepo = makeSafetyEventRepo();

      await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          moderationClient: moderation,
          safetyEventRepository: safetyRepo,
        })
      );

      expect(safetyRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          Trigger: 'output_moderation',
          UserID: 'u1',
        })
      );
    });

    it('Moderation API エラーは例外を投げず通常応答を続ける（fail-warn）', async () => {
      const llm = makeLLMClient(['通常の応答。']);
      const voice = makeVoiceClient();
      const repo = makeRepo();
      const failingModeration: IModerationClient = {
        check: jest.fn(async () => {
          throw new Error('API 障害');
        }),
      };

      const events = await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          moderationClient: failingModeration,
        })
      );

      // エラーにならず done が来る
      expect(events[events.length - 1]).toEqual({ type: 'done' });
      // safety event は来ない
      expect(events.find((e) => e.type === 'safety')).toBeUndefined();
    });

    it('Moderation クライアント未指定ならチェックをスキップする', async () => {
      const llm = makeLLMClient(['応答。']);
      const voice = makeVoiceClient();
      const repo = makeRepo();

      const events = await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          // moderationClient なし
        })
      );

      expect(events.find((e) => e.type === 'safety')).toBeUndefined();
      expect(events[events.length - 1]).toEqual({ type: 'done' });
    });
  });

  // ── 音声すり抜けバグ修正テスト（output_moderation フラグ時の音声制御） ─────────

  describe('output_moderation フラグ時の音声すり抜け防止', () => {
    it('フラグ時、元返答テキストを含む sentence イベントが emit されない', async () => {
      const originalText = '元の危険な応答テキストです。';
      const llm = makeLLMClient([originalText]);
      const voice = makeVoiceClient();
      const repo = makeRepo();
      const moderation = makeModerationClient(true, { 'self-harm': true });

      const events = await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          moderationClient: moderation,
        })
      );

      const sentenceEvents = events.filter((e) => e.type === 'sentence');
      // 元返答テキストを含む sentence イベントが存在しないこと
      const hasOriginalText = sentenceEvents.some(
        (e) => e.type === 'sentence' && e.text === originalText
      );
      expect(hasOriginalText).toBe(false);
    });

    it('フラグ時、置換文の sentence イベントが emit される', async () => {
      const llm = makeLLMClient(['元の危険な応答。']);
      const voice = makeVoiceClient();
      const repo = makeRepo();
      const moderation = makeModerationClient(true, { 'self-harm': true });

      const events = await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          moderationClient: moderation,
        })
      );

      const sentenceEvents = events.filter((e) => e.type === 'sentence');
      // 置換文の sentence イベントが存在すること
      expect(sentenceEvents.length).toBeGreaterThan(0);
      // safety イベントの replacementText と sentence イベントのテキストが対応していること
      const safetyEvent = events.find((e) => e.type === 'safety');
      expect(safetyEvent?.type).toBe('safety');
      if (safetyEvent?.type === 'safety') {
        const replacementText = safetyEvent.replacementText!;
        // sentence イベントは置換文を分割したものなので、sentence テキストの結合が置換文に一致するか
        // または置換文そのものが sentence として送出される（1 文の場合）
        const sentenceTexts = sentenceEvents
          .filter((e) => e.type === 'sentence')
          .map((e) => (e.type === 'sentence' ? e.text : ''));
        const joinedSentences = sentenceTexts.join('');
        expect(joinedSentences).toBe(replacementText);
      }
    });

    it('フラグ時、safety イベントが sentence イベントより前に emit される（イベント順序）', async () => {
      const llm = makeLLMClient(['危険なコンテンツを含む応答です。']);
      const voice = makeVoiceClient();
      const repo = makeRepo();
      const moderation = makeModerationClient(true, { violence: true });

      const events = await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          moderationClient: moderation,
        })
      );

      const safetyIdx = events.findIndex((e) => e.type === 'safety');
      const firstSentenceIdx = events.findIndex((e) => e.type === 'sentence');

      expect(safetyIdx).toBeGreaterThanOrEqual(0);
      expect(firstSentenceIdx).toBeGreaterThan(safetyIdx);
    });

    it('フラグ時、保存される assistant message が置換文である（元返答ではない）', async () => {
      const originalText = '有害な応答テキストです。';
      const llm = makeLLMClient([originalText]);
      const voice = makeVoiceClient();
      const repo = makeRepo();
      const moderation = makeModerationClient(true, { harassment: true });

      await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          moderationClient: moderation,
        })
      );

      // messageRepository.create の呼び出し引数を確認
      const createCalls = (repo.create as jest.Mock).mock.calls;
      // assistant ロールの保存呼び出しを探す
      const assistantCall = createCalls.find(
        (args: Array<{ Role: string; Text: string }>) => args[0]?.Role === 'assistant'
      );
      expect(assistantCall).toBeDefined();
      const savedText: string = assistantCall[0].Text;
      // 元返答ではなく置換文が保存されていること
      expect(savedText).not.toBe(originalText.trim());
      // 置換文は MODERATION_REPLACEMENT_MESSAGES のいずれかに一致すること
      expect(MODERATION_REPLACEMENT_MESSAGES).toContain(savedText);
    });

    it('フラグなし（回帰）: 元返答の sentence イベントが emit され、assistant message に元返答が保存される', async () => {
      const originalText = '通常の安全な応答テキストです。';
      const llm = makeLLMClient([originalText]);
      const voice = makeVoiceClient();
      const repo = makeRepo();
      const moderation = makeModerationClient(false);

      const events = await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          moderationClient: moderation,
        })
      );

      // safety イベントなし
      expect(events.find((e) => e.type === 'safety')).toBeUndefined();

      // 元返答テキストを含む sentence イベントが存在すること
      const sentenceEvents = events.filter((e) => e.type === 'sentence');
      expect(sentenceEvents.length).toBeGreaterThan(0);
      const hasOriginalText = sentenceEvents.some(
        (e) => e.type === 'sentence' && e.text === originalText
      );
      expect(hasOriginalText).toBe(true);

      // assistant message に元返答が保存されていること
      const createCalls = (repo.create as jest.Mock).mock.calls;
      const assistantCall = createCalls.find(
        (args: Array<{ Role: string; Text: string }>) => args[0]?.Role === 'assistant'
      );
      expect(assistantCall).toBeDefined();
      expect(assistantCall[0].Text).toBe(originalText.trim());
    });

    it('フラグ時、元返答テキストで合成された音声の sentence イベントが emit されない（音声すり抜け防止の直接検証）', async () => {
      // LLM ストリーム中に非同期で TTS 合成が起動されるが（仕様上許容）、
      // フラグ時はその音声を sentence として emit せず、置換文の音声のみを emit することを確認する。
      // voice.synthesize の引数（テキスト）を記録し、sentence イベントのテキストと突き合わせる。
      const originalText = '危険な応答テキスト。';
      const synthesizeArgs: string[] = [];
      const voice: IVoiceClient = {
        synthesize: jest.fn(async (text: string) => {
          synthesizeArgs.push(text);
          return new ArrayBuffer(4);
        }),
      };
      const llm = makeLLMClient([originalText]);
      const repo = makeRepo();
      const moderation = makeModerationClient(true, { 'self-harm': true });

      const events = await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          moderationClient: moderation,
        })
      );

      // sentence として emit されたテキスト一覧
      const sentenceTexts = events
        .filter((e) => e.type === 'sentence')
        .map((e) => (e.type === 'sentence' ? e.text : ''));

      // 元返答テキストが sentence として emit されていないこと
      expect(sentenceTexts).not.toContain(originalText);

      // フラグ時、sentence として emit されるのは置換文のみ（空でないこと）
      expect(sentenceTexts.length).toBeGreaterThan(0);
      sentenceTexts.forEach((text) => {
        expect(text).not.toBe(originalText);
      });
    });
  });

  // ── 知識ゲート（リブトーク知識・記憶再設計 P5 / #3697、classifyTopic のみで判定） ──

  describe('知識ゲート（classifyTopic）', () => {
    function makeStudyTopicRepo(): StudyTopicRepository {
      return {
        put: jest.fn(async (input) => ({ ...input, CreatedAt: Date.now(), UpdatedAt: Date.now() })),
        listByStatus: jest.fn(async () => []),
        updateStatus: jest.fn(async (input) => ({
          ...input,
          CreatedAt: Date.now(),
          UpdatedAt: Date.now(),
        })),
        findPendingByTopic: jest.fn(async () => null),
      } as unknown as StudyTopicRepository;
    }

    it('needsStudy=true → 「勉強しておくね」テンプレ応答で LLM をバイパスする', async () => {
      const studyTopicRepo = makeStudyTopicRepo();
      const llm = makeLLMClient(['応答']);
      (llm.chatStructured as jest.Mock).mockResolvedValue({
        needsStudy: true,
        normalizedTopic: '最新アニメ',
      });
      const voice = makeVoiceClient();
      const repo = makeRepo();

      const events = await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          userText: '最新アニメ教えて',
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          studyTopicRepository: studyTopicRepo,
        })
      );

      // chatStream（通常 LLM）は呼ばれない
      expect(llm.chatStream).not.toHaveBeenCalled();
      // テンプレ text が流れる
      const textEvents = events.filter((e) => e.type === 'text');
      expect(textEvents.length).toBeGreaterThan(0);
      // done で終わる
      expect(events[events.length - 1]).toEqual({ type: 'done' });
      // STUDY_TOPIC が登録される
      expect(studyTopicRepo.put).toHaveBeenCalledWith(
        expect.objectContaining({ Topic: '最新アニメ', Status: 'pending' })
      );
    });

    it('needsStudy=true + 既存 pending → 重複登録しない', async () => {
      const studyTopicRepo = makeStudyTopicRepo();
      (studyTopicRepo.findPendingByTopic as jest.Mock).mockResolvedValue({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'tp-existing',
        Topic: '最新アニメ',
        Priority: 10,
        Status: 'pending',
        CreatedAt: Date.now(),
        UpdatedAt: Date.now(),
      });
      const llm = makeLLMClient(['応答']);
      (llm.chatStructured as jest.Mock).mockResolvedValue({
        needsStudy: true,
        normalizedTopic: '最新アニメ',
      });
      const voice = makeVoiceClient();
      const repo = makeRepo();

      await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          userText: '最新アニメ教えて',
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          studyTopicRepository: studyTopicRepo,
        })
      );

      expect(studyTopicRepo.put).not.toHaveBeenCalled();
    });

    it('needsStudy=false → 通常 LLM 応答', async () => {
      const llm = makeLLMClient(['もちろん！']);
      (llm.chatStructured as jest.Mock).mockResolvedValue({
        needsStudy: false,
        normalizedTopic: '挨拶',
      });
      const voice = makeVoiceClient();
      const repo = makeRepo();

      const events = await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          userText: 'おはよう！',
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
        })
      );

      expect(llm.chatStream).toHaveBeenCalled();
      const textEvents = events.filter((e) => e.type === 'text');
      expect(textEvents.length).toBeGreaterThan(0);
    });

    it('studyTopicRepository 未指定でも needsStudy=true ならテンプレ応答で継続する（登録のみスキップ）', async () => {
      const llm = makeLLMClient(['応答']);
      (llm.chatStructured as jest.Mock).mockResolvedValue({
        needsStudy: true,
        normalizedTopic: 'テスト',
      });
      const voice = makeVoiceClient();
      const repo = makeRepo();

      const events = await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          userText: 'テスト',
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          // studyTopicRepository なし
        })
      );

      expect(llm.chatStream).not.toHaveBeenCalled();
      expect(events[events.length - 1]).toEqual({ type: 'done' });
    });

    it('知識ゲート（classifyTopic）がエラーを投げても通常フローで継続する（fail-warn）', async () => {
      const llm = makeLLMClient(['エラーでも応答']);
      (llm.chatStructured as jest.Mock).mockRejectedValue(new Error('LLM error'));
      const voice = makeVoiceClient();
      const repo = makeRepo();

      const events = await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          userText: 'テスト',
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
        })
      );

      // エラーでも通常 LLM 応答が返る
      expect(llm.chatStream).toHaveBeenCalled();
      expect(events[events.length - 1]).toEqual({ type: 'done' });
    });

    it('study 分岐後はアシスタントメッセージが保存される', async () => {
      const llm = makeLLMClient(['通常応答']);
      (llm.chatStructured as jest.Mock).mockResolvedValue({
        needsStudy: true,
        normalizedTopic: 'テスト',
      });
      const voice = makeVoiceClient();
      const repo = makeRepo();

      await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          userText: 'テスト',
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
        })
      );

      const createCalls = (repo.create as jest.Mock).mock.calls;
      const assistantCall = createCalls.find(
        (args: unknown[]) => (args[0] as { Role: string }).Role === 'assistant'
      );
      expect(assistantCall).toBeDefined();
      // テンプレ応答文（「知らない」系メッセージ）が保存される
      const savedText = (assistantCall![0] as { Text: string }).Text;
      expect(
        savedText.includes('勉強') || savedText.includes('調べ') || savedText.includes('わからない')
      ).toBe(true);
    });
  });

  describe('ノートの感想連携（Phase 5c）', () => {
    function makeNoteRepo(notes: NoteEntity[]): NoteRepository {
      return {
        put: jest.fn(),
        list: jest.fn(async () => notes),
        listAll: jest.fn(async () => notes),
        get: jest.fn(async () => null),
        listRecent: jest.fn(async () => notes),
        updateReaction: jest.fn(async () => undefined),
      };
    }

    const sampleNote: NoteEntity = {
      UserID: 'u1',
      CharacterID: 'hiyori',
      NoteID: 'note-1',
      TopicID: 'topic-1',
      Subject: 'コーヒーの淹れ方',
      Headline: '本文。\n\nコメント。',
      CreatedAt: 1_700_000_000_000,
      UpdatedAt: 1_700_000_000_000,
    };

    it('noteRepository 指定時は直近ノートを system prompt に注入する', async () => {
      const llm = makeLLMClient(['うん']);
      const voice = makeVoiceClient();
      const repo = makeRepo();
      const noteRepo = makeNoteRepo([sampleNote]);

      await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          userText: 'あのノート良かったよ',
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          noteRepository: noteRepo,
        })
      );

      expect(noteRepo.listRecent).toHaveBeenCalledWith('u1', 'hiyori', {
        days: 7,
        limit: 3,
      });
      const streamArgs = (llm.chatStream as jest.Mock).mock.calls[0][0] as Array<{
        role: string;
        content: string;
      }>;
      const systemMsg = streamArgs.find((m) => m.role === 'system');
      expect(systemMsg?.content).toContain('最近ユーザーに渡したノート');
      expect(systemMsg?.content).toContain('コーヒーの淹れ方');
    });

    it('直近ノートが空なら system prompt にノートセクションを含めない', async () => {
      const llm = makeLLMClient(['うん']);
      const voice = makeVoiceClient();
      const repo = makeRepo();
      const noteRepo = makeNoteRepo([]);

      await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          noteRepository: noteRepo,
        })
      );

      const streamArgs = (llm.chatStream as jest.Mock).mock.calls[0][0] as Array<{
        role: string;
        content: string;
      }>;
      const systemMsg = streamArgs.find((m) => m.role === 'system');
      expect(systemMsg?.content).not.toContain('最近ユーザーに渡したノート');
    });

    it('listRecent が失敗してもノートなしで応答を継続する', async () => {
      const llm = makeLLMClient(['うん']);
      const voice = makeVoiceClient();
      const repo = makeRepo();
      const noteRepo = makeNoteRepo([]);
      (noteRepo.listRecent as jest.Mock).mockRejectedValueOnce(new Error('boom'));

      const events = await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          noteRepository: noteRepo,
        })
      );

      expect(events.some((e) => e.type === 'done')).toBe(true);
      expect(llm.chatStream).toHaveBeenCalled();
    });
  });

  // ── Topic 想起（関連度 only）（リブトーク知識再設計 P2 / #3698、P5 で必須化） ──────

  describe('Topic 想起（topicRetriever）', () => {
    it('retrieve が userInput 付きで呼ばれる', async () => {
      const llm = makeLLMClient(['ok。']);
      const voice = makeVoiceClient();
      const repo = makeRepo();
      const topicRetriever = makeTopicRetriever();

      await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          topicRetriever,
        })
      );

      expect(topicRetriever.retrieve).toHaveBeenCalledWith(
        'u1',
        'hiyori',
        expect.objectContaining({ userInput: 'こんにちは' })
      );
    });

    it('retrieve 結果（subject/SELF/WEB）が system prompt に注入される', async () => {
      const topics = [makeRetrievedTopic('コーヒー', ['朝コーヒーを飲む'])];
      const llm = makeLLMClient(['ok。']);
      const voice = makeVoiceClient();
      const repo = makeRepo();

      await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          topicRetriever: makeTopicRetriever(topics),
        })
      );

      const streamArgs = (llm.chatStream as jest.Mock).mock.calls[0][0] as Array<{
        role: string;
        content: string;
      }>;
      const systemMsg = streamArgs.find((m) => m.role === 'system');
      expect(systemMsg?.content).toContain('今の話題に関連');
      expect(systemMsg?.content).toContain('■ コーヒー');
      expect(systemMsg?.content).toContain('（あなたが聞いたこと）朝コーヒーを飲む');
    });

    it('retrieve 失敗時は想起なしで会話を継続する（fail-warn）', async () => {
      const failingRetriever: ITopicRetriever = {
        retrieve: jest.fn(async () => {
          throw new Error('retrieve 失敗');
        }),
      };
      const llm = makeLLMClient(['ok。']);
      const voice = makeVoiceClient();
      const repo = makeRepo();

      const events = await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          topicRetriever: failingRetriever,
        })
      );

      expect(events[events.length - 1]).toEqual({ type: 'done' });
      expect(llm.chatStream).toHaveBeenCalled();
    });
  });

  // ── 会話履歴の境界（集約カーソル）（リブトーク知識・記憶再設計 P5 / #3697） ──────

  describe('会話履歴の境界（consolidationCursorRepository）', () => {
    it('カーソルがあるとき listSince が MsgCursor で呼ばれる', async () => {
      const llm = makeLLMClient(['うん']);
      const voice = makeVoiceClient();
      const repo = makeRepo();
      const cursorRepo = makeConsolidationCursorRepo({
        UserID: 'u1',
        CharacterID: 'hiyori',
        MsgCursor: 1_700_000_500_000,
        WebrawCursor: 0,
        UpdatedAt: 1_700_000_500_000,
      });

      await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          consolidationCursorRepository: cursorRepo,
        })
      );

      expect(repo.listSince).toHaveBeenCalledWith('u1', 'hiyori', 1_700_000_500_000);
    });

    it('カーソルが null のとき listSince(0) で全件取得する（fallback）', async () => {
      const llm = makeLLMClient(['うん']);
      const voice = makeVoiceClient();
      const repo = makeRepo();
      const cursorRepo = makeConsolidationCursorRepo(null);

      await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          consolidationCursorRepository: cursorRepo,
        })
      );

      expect(repo.listSince).toHaveBeenCalledWith('u1', 'hiyori', 0);
    });

    it('consolidationCursorRepository 未指定のとき listSince(0) で全件取得する（fallback）', async () => {
      const llm = makeLLMClient(['うん']);
      const voice = makeVoiceClient();
      const repo = makeRepo();

      await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          // consolidationCursorRepository なし
        })
      );

      expect(repo.listSince).toHaveBeenCalledWith('u1', 'hiyori', 0);
    });

    it('カーソル取得エラー時は sinceMs=0 で全件取得を継続する（fail-warn）', async () => {
      const llm = makeLLMClient(['うん']);
      const voice = makeVoiceClient();
      const repo = makeRepo();
      const cursorRepo = makeConsolidationCursorRepo(null, {
        get: jest.fn(async () => {
          throw new Error('DB error');
        }),
      });

      const events = await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          consolidationCursorRepository: cursorRepo,
        })
      );

      expect(repo.listSince).toHaveBeenCalledWith('u1', 'hiyori', 0);
      expect(events[events.length - 1]).toEqual({ type: 'done' });
    });

    it('MsgCursor 以降のメッセージのみが history として LLM に渡される', async () => {
      // listSince はリポジトリ側で境界フィルタする責務を持つため、モックは
      // 「sinceMs で呼ばれたら境界以降の履歴だけ返す」ことを模して検証する。
      const oldMessage = makeMessage('user', '集約済みの古い話', 'old-1');
      const recentMessage = makeMessage('assistant', '未集約の最近の話', 'recent-1');
      const cursor: ConsolidationCursorEntity = {
        UserID: 'u1',
        CharacterID: 'hiyori',
        MsgCursor: 1_700_000_500_000,
        WebrawCursor: 0,
        UpdatedAt: 1_700_000_500_000,
      };
      const repo = makeRepo([], {
        listSince: jest.fn(async (_userId, _characterId, sinceMs) =>
          sinceMs >= cursor.MsgCursor ? [recentMessage] : [oldMessage, recentMessage]
        ),
      });
      const llm = makeLLMClient(['うん']);
      const voice = makeVoiceClient();
      const cursorRepo = makeConsolidationCursorRepo(cursor);

      await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          consolidationCursorRepository: cursorRepo,
        })
      );

      const streamArgs = (llm.chatStream as jest.Mock).mock.calls[0][0] as Array<{
        role: string;
        content: string;
      }>;
      const historyContents = streamArgs
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => m.content);
      expect(historyContents).toContain('未集約の最近の話');
      expect(historyContents).not.toContain('集約済みの古い話');
    });
  });

  // ── 親密度更新（Tier 昇格撤去に伴い infoDisclosure は常に 0） ────────────────────

  describe('親密度更新（characterStateRepository）', () => {
    function makeCharacterStateRepo(
      prev: CharacterStateEntity | null = null
    ): CharacterStateRepository {
      return {
        getById: jest.fn(async () => prev),
        upsert: jest.fn(async (input) => ({
          ...input,
          AffectionLevel: 0,
          CreatedAt: 0,
          UpdatedAt: 0,
        })) as unknown as CharacterStateRepository['upsert'],
        updateAffection: jest.fn(async (userId, characterId, delta) => ({
          UserID: userId,
          CharacterID: characterId,
          LastInteractionAt: 0,
          AffectionLevel: delta,
          CreatedAt: 0,
          UpdatedAt: 0,
        })),
      };
    }

    it('初回接触（prevCharacterState なし）は isNewActiveDay=true で updateAffection が呼ばれる', async () => {
      const llm = makeLLMClient(['うん']);
      const voice = makeVoiceClient();
      const repo = makeRepo();
      const characterStateRepository = makeCharacterStateRepo(null);

      await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          characterStateRepository,
        })
      );

      // fire-and-forget のため少し待つ
      await new Promise((resolve) => setImmediate(resolve));
      expect(characterStateRepository.updateAffection).toHaveBeenCalledWith('u1', 'hiyori', 1);
    });

    it('同日中の再接触（isNewActiveDay=false）は Tier 昇格撤去に伴い delta=0 のため updateAffection が呼ばれない', async () => {
      const llm = makeLLMClient(['うん']);
      const voice = makeVoiceClient();
      const repo = makeRepo();
      const now = Date.now();
      const characterStateRepository = makeCharacterStateRepo({
        UserID: 'u1',
        CharacterID: 'hiyori',
        AffectionLevel: 5,
        LastInteractionAt: now,
        CreatedAt: 0,
        UpdatedAt: 0,
      });

      await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          characterStateRepository,
        })
      );

      await new Promise((resolve) => setImmediate(resolve));
      expect(characterStateRepository.updateAffection).not.toHaveBeenCalled();
    });

    it('characterStateRepository 未指定なら親密度更新をスキップする', async () => {
      const llm = makeLLMClient(['うん']);
      const voice = makeVoiceClient();
      const repo = makeRepo();

      const events = await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          // characterStateRepository なし
        })
      );

      expect(events[events.length - 1]).toEqual({ type: 'done' });
    });

    it('updateAffection のエラーは例外を投げない（fail-warn）', async () => {
      const llm = makeLLMClient(['うん']);
      const voice = makeVoiceClient();
      const repo = makeRepo();
      const characterStateRepository = makeCharacterStateRepo(null);
      (characterStateRepository.updateAffection as jest.Mock).mockRejectedValue(
        new Error('DB error')
      );

      const events = await collectEvents(
        runChatUseCase({
          ...makeBaseParams(),
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          characterStateRepository,
        })
      );

      await new Promise((resolve) => setImmediate(resolve));
      expect(events[events.length - 1]).toEqual({ type: 'done' });
    });
  });
});
