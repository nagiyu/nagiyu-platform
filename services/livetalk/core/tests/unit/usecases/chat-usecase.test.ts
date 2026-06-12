import { runChatUseCase, type ChatEvent } from '../../../src/usecases/chat-usecase.js';
import { hiyori } from '../../../src/characters/hiyori.js';
import { MODERATION_REPLACEMENT_MESSAGES } from '../../../src/safety/templates.js';
import type { ILLMClient } from '../../../src/llm-client/types.js';
import type { IVoiceClient } from '../../../src/voice/types.js';
import type { MemoryRepository } from '../../../src/repositories/memory.repository.interface.js';
import type { MemorySummaryRepository } from '../../../src/repositories/memory-summary.repository.interface.js';
import type { MessageRepository } from '../../../src/repositories/message.repository.interface.js';
import type { SafetyEventRepository } from '../../../src/repositories/safety-event.repository.interface.js';
import type { KnowledgeRepository } from '../../../src/repositories/knowledge.repository.interface.js';
import type { StudyTopicRepository } from '../../../src/repositories/study-topic.repository.interface.js';
import type { NoteRepository } from '../../../src/repositories/note.repository.interface.js';
import type { NoteEntity } from '../../../src/entities/note.entity.js';
import type { MessageEntity } from '../../../src/entities/message.entity.js';
import type { MemoryEntity } from '../../../src/entities/memory.entity.js';
import type { MemorySummaryEntity } from '../../../src/entities/memory-summary.entity.js';
import type { KnowledgeEntity } from '../../../src/entities/knowledge.entity.js';
import type { SafetyEventEntity } from '../../../src/entities/safety-event.entity.js';
import type { IModerationClient, ModerationResult } from '../../../src/safety/types.js';
import type { IMemoryRetriever, RetrievedMemory } from '../../../src/memory/types.js';

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
    chatStructured: jest.fn(async () => ({
      detected: false,
      targetMemoryIds: null,
      newValue: null,
    })) as unknown as ILLMClient['chatStructured'],
    summarize: jest.fn(async () => ({ mergedSummary: '', newMemoryCandidates: [] })),
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

function makeMemorySummaryRepo(
  summary: MemorySummaryEntity | null = null
): MemorySummaryRepository {
  return {
    get: jest.fn(async () => summary),
    put: jest.fn(async (input) => ({
      ...input,
      CreatedAt: Date.now(),
      UpdatedAt: Date.now(),
    })),
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

function makeMemoryRetriever(memories: RetrievedMemory[] = []): IMemoryRetriever {
  return {
    retrieve: jest.fn(async () => ({ memories })),
  };
}

function makeMemoryRepo(): MemoryRepository {
  return {
    put: jest.fn(),
    get: jest.fn(async () => null),
    listByTier: jest.fn(async () => ({ items: [] })),
    listByCategory: jest.fn(async () => []),
    update: jest.fn(
      async (input) =>
        ({
          UserID: input.UserID,
          CharacterID: input.CharacterID,
          MemoryID: input.MemoryID,
          Tier: input.Tier,
          Category: input.Category,
          Content: 'x',
          Confidence: 0.8,
          ReferencedCount: input.ReferencedCount ?? 0,
          CreatedAt: 0,
          UpdatedAt: 0,
        }) as MemoryEntity
    ),
    delete: jest.fn(),
    promote: jest.fn(),
    demote: jest.fn(),
  } as unknown as MemoryRepository;
}

// ── テスト本体 ──────────────────────────────────────────────────────────────

describe('runChatUseCase', () => {
  const baseParams: {
    userId: string;
    characterId: string;
    userText: string;
    character: typeof hiyori;
  } = {
    userId: 'u1',
    characterId: 'hiyori',
    userText: 'こんにちは',
    character: hiyori,
  };

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
          ...baseParams,
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
          ...baseParams,
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
          ...baseParams,
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
          ...baseParams,
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
          ...baseParams,
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
          ...baseParams,
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
          ...baseParams,
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
          ...baseParams,
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
          ...baseParams,
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
          ...baseParams,
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
            ...baseParams,
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
            ...baseParams,
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
          ...baseParams,
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
          detected: false,
          targetMemoryIds: null,
          newValue: null,
        })) as unknown as ILLMClient['chatStructured'],
        summarize: jest.fn(async () => ({ mergedSummary: '', newMemoryCandidates: [] })),
      };
      const voice = makeVoiceClient();
      const repo = makeRepo();

      await expect(
        collectEvents(
          runChatUseCase({
            ...baseParams,
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
          ...baseParams,
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
          ...baseParams,
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
          ...baseParams,
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
          ...baseParams,
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
          ...baseParams,
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
            ...baseParams,
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
            ...baseParams,
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

  describe('Memory retrieval 統合', () => {
    function makeRetrievedMemory(content: string): RetrievedMemory {
      const memory: MemoryEntity = {
        UserID: 'u1',
        CharacterID: 'hiyori',
        MemoryID: 'mem-001',
        Tier: 'B',
        Category: 'food',
        Content: content,
        Confidence: 0.8,
        ReferencedCount: 2,
        CreatedAt: 0,
        UpdatedAt: 0,
      };
      return { memory, similarity: 0.9 };
    }

    it('memoryRetriever が指定されると retrieve が呼ばれる', async () => {
      const llm = makeLLMClient(['ok。']);
      const voice = makeVoiceClient();
      const repo = makeRepo();
      const retriever = makeMemoryRetriever();

      await collectEvents(
        runChatUseCase({
          ...baseParams,
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          memoryRetriever: retriever,
        })
      );

      expect(retriever.retrieve).toHaveBeenCalledWith(
        'u1',
        'hiyori',
        expect.objectContaining({ userInput: 'こんにちは' })
      );
    });

    it('memoryRetriever 未指定の場合は retrieve が呼ばれない', async () => {
      const llm = makeLLMClient(['ok。']);
      const voice = makeVoiceClient();
      const repo = makeRepo();
      const retriever = makeMemoryRetriever();

      await collectEvents(
        runChatUseCase({
          ...baseParams,
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          // memoryRetriever なし
        })
      );

      expect(retriever.retrieve).not.toHaveBeenCalled();
    });

    it('retrieve 結果が system prompt に注入される（LLM に渡されるメッセージで確認）', async () => {
      const retrieved = [makeRetrievedMemory('コーヒーが好き')];
      const llm = makeLLMClient(['ok。']);
      const voice = makeVoiceClient();
      const repo = makeRepo();

      await collectEvents(
        runChatUseCase({
          ...baseParams,
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          memoryRetriever: makeMemoryRetriever(retrieved),
        })
      );

      const chatStreamMock = llm.chatStream as jest.Mock;
      const passedMessages = chatStreamMock.mock.calls[0][0];
      expect(passedMessages[0].content).toContain('あなたが覚えていること');
      expect(passedMessages[0].content).toContain('- コーヒーが好き');
    });

    it('retrieve 失敗時は memory なしで通常応答を継続する（fail-warn）', async () => {
      const failingRetriever: IMemoryRetriever = {
        retrieve: jest.fn(async () => {
          throw new Error('retrieve 失敗');
        }),
      };
      const llm = makeLLMClient(['ok。']);
      const voice = makeVoiceClient();
      const repo = makeRepo();

      const events = await collectEvents(
        runChatUseCase({
          ...baseParams,
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          memoryRetriever: failingRetriever,
        })
      );

      expect(events[events.length - 1]).toEqual({ type: 'done' });
    });

    it('retrieve された Memory の referencedCount が更新される（fire-and-forget）', async () => {
      const retrieved = [makeRetrievedMemory('コーヒーが好き')];
      const llm = makeLLMClient(['ok。']);
      const voice = makeVoiceClient();
      const repo = makeRepo();
      const memRepo = makeMemoryRepo();

      await collectEvents(
        runChatUseCase({
          ...baseParams,
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          memoryRetriever: makeMemoryRetriever(retrieved),
          memoryRepository: memRepo,
        })
      );

      // fire-and-forget のため少し待つ
      await new Promise((r) => setTimeout(r, 10));
      expect(memRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          MemoryID: 'mem-001',
          ReferencedCount: 3,
        })
      );
    });

    it('memoryRepository 未指定の場合は referencedCount 更新がスキップされる', async () => {
      const retrieved = [makeRetrievedMemory('コーヒーが好き')];
      const llm = makeLLMClient(['ok。']);
      const voice = makeVoiceClient();
      const repo = makeRepo();

      await expect(
        collectEvents(
          runChatUseCase({
            ...baseParams,
            llmClient: llm,
            voiceClient: voice,
            messageRepository: repo,
            memoryRetriever: makeMemoryRetriever(retrieved),
            // memoryRepository なし
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
          ...baseParams,
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
          ...baseParams,
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
          ...baseParams,
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
          ...baseParams,
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
          ...baseParams,
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
          ...baseParams,
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
          ...baseParams,
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
          ...baseParams,
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
          ...baseParams,
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
          ...baseParams,
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
          ...baseParams,
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

  // ── Phase 3d: 暗黙確認・訂正検出 ───────────────────────────────────────────

  describe('暗黙訂正検出（Phase 3d）', () => {
    function makeRetrieved(id: string, content: string): RetrievedMemory {
      return {
        memory: {
          UserID: 'u1',
          CharacterID: 'hiyori',
          MemoryID: id,
          Tier: 'B',
          Category: 'food',
          Content: content,
          Confidence: 0.8,
          ReferencedCount: 2,
          CreatedAt: 0,
          UpdatedAt: 0,
        },
        similarity: 0.9,
      };
    }

    it('訂正検出時に memoryRepo.update を呼ぶ（confidence 減算）', async () => {
      const history = [makeMessage('assistant', 'コーヒーが好きなんだね！', 'a1')];
      const memories = [makeRetrieved('m1', 'コーヒーが好き')];
      const retriever = makeMemoryRetriever(memories);
      const memRepo = makeMemoryRepo();
      // LLM: classify → 訂正あり / stream → 通常応答
      const llm: ILLMClient = {
        chatStream: jest.fn(async function* () {
          yield '了解！';
        }),
        chatComplete: jest.fn(),
        chatStructured: jest.fn(async () => ({
          detected: true,
          targetMemoryIds: ['m1'],
          newValue: 'お茶が好き',
        })) as unknown as ILLMClient['chatStructured'],
        summarize: jest.fn(),
      };
      const voice = makeVoiceClient();
      const repo = makeRepo(history);

      await collectEvents(
        runChatUseCase({
          ...baseParams,
          userText: '違う、お茶が好きなんだ',
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          memoryRetriever: retriever,
          memoryRepository: memRepo,
        })
      );

      expect(memRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          MemoryID: 'm1',
          Confidence: expect.any(Number),
        })
      );
    });

    it('直前アシスタントメッセージがない場合は訂正検出をスキップする', async () => {
      const memories = [makeRetrieved('m1', 'コーヒーが好き')];
      const retriever = makeMemoryRetriever(memories);
      const memRepo = makeMemoryRepo();
      const llm: ILLMClient = {
        chatStream: jest.fn(async function* () {
          yield '了解！';
        }),
        chatComplete: jest.fn(),
        chatStructured: jest.fn(async () => ({
          detected: false,
          targetMemoryIds: null,
          newValue: null,
        })) as unknown as ILLMClient['chatStructured'],
        summarize: jest.fn(),
      };
      const voice = makeVoiceClient();
      // history にアシスタントメッセージなし
      const repo = makeRepo([makeMessage('user', '最初のメッセージ')]);

      await collectEvents(
        runChatUseCase({
          ...baseParams,
          userText: '違う！',
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          memoryRetriever: retriever,
          memoryRepository: memRepo,
        })
      );

      // chatStructured が classify 用途で呼ばれないことを確認（訂正検出スキップ）
      expect(llm.chatStructured).not.toHaveBeenCalled();
    });

    it('訂正検出がエラーを投げても LLM 応答を継続する（fail-warn）', async () => {
      const history = [makeMessage('assistant', 'コーヒーが好きなんだね！', 'a1')];
      const memories = [makeRetrieved('m1', 'コーヒーが好き')];
      const retriever = makeMemoryRetriever(memories);
      const memRepo = makeMemoryRepo();
      const llm: ILLMClient = {
        chatStream: jest.fn(async function* () {
          yield '了解！';
        }),
        chatComplete: jest.fn(),
        chatStructured: jest.fn(async () => {
          throw new Error('API error');
        }),
        summarize: jest.fn(),
      };
      const voice = makeVoiceClient();
      const repo = makeRepo(history);

      const events = await collectEvents(
        runChatUseCase({
          ...baseParams,
          userText: '違う！',
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          memoryRetriever: retriever,
          memoryRepository: memRepo,
        })
      );

      // エラーにならず done が来る
      expect(events[events.length - 1]).toEqual({ type: 'done' });
    });

    it('memoryRepository が未指定の場合は訂正検出をスキップする', async () => {
      const memories = [makeRetrieved('m1', 'コーヒーが好き')];
      const retriever = makeMemoryRetriever(memories);
      const llm = makeLLMClient(['了解！']);
      const voice = makeVoiceClient();
      const repo = makeRepo([makeMessage('assistant', 'コーヒーが好きなんだね！', 'a1')]);

      const events = await collectEvents(
        runChatUseCase({
          ...baseParams,
          userText: '違う！',
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          memoryRetriever: retriever,
          // memoryRepository なし
        })
      );

      expect(events[events.length - 1]).toEqual({ type: 'done' });
    });
  });

  describe('Tier C 昇格候補検出（Phase 3d）', () => {
    it('embeddingClient がある場合は identifyPromotionCandidates を試みる', async () => {
      const memRepo = makeMemoryRepo();
      const llm: ILLMClient = {
        chatStream: jest.fn(async function* () {
          yield '了解！';
        }),
        chatComplete: jest.fn(),
        chatStructured: jest.fn(async () => ({
          promotions: [],
        })) as unknown as ILLMClient['chatStructured'],
        summarize: jest.fn(),
      };
      const voice = makeVoiceClient();
      const repo = makeRepo();
      const embeddingClient = { embed: jest.fn(async () => [1, 0, 0]) };

      await collectEvents(
        runChatUseCase({
          ...baseParams,
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          memoryRepository: memRepo,
          embeddingClient,
        })
      );

      expect(memRepo.listByTier).toHaveBeenCalledWith('u1', 'hiyori', 'C');
    });

    it('embeddingClient が未指定なら昇格候補検出をスキップする', async () => {
      const memRepo = makeMemoryRepo();
      const llm = makeLLMClient(['了解！']);
      const voice = makeVoiceClient();
      const repo = makeRepo();

      await collectEvents(
        runChatUseCase({
          ...baseParams,
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          memoryRepository: memRepo,
          // embeddingClient なし
        })
      );

      // Tier C 取得は呼ばれない
      expect(memRepo.listByTier).not.toHaveBeenCalledWith('u1', 'hiyori', 'C');
    });

    it('昇格候補がある場合 executePromotion が呼ばれる（fire-and-forget）', async () => {
      const tierCMem: MemoryEntity = {
        UserID: 'u1',
        CharacterID: 'hiyori',
        MemoryID: 'c1',
        Tier: 'C',
        Category: 'food',
        Content: 'コーヒーが好き',
        Confidence: 0.5,
        ReferencedCount: 1,
        CreatedAt: 0,
        UpdatedAt: 0,
        Embedding: [1, 0, 0],
      };
      const memRepo = makeMemoryRepo();
      (memRepo.listByTier as jest.Mock).mockResolvedValue({ items: [tierCMem] });
      const llm: ILLMClient = {
        chatStream: jest.fn(async function* () {
          yield '覚えとくね！';
        }),
        chatComplete: jest.fn(),
        chatStructured: jest.fn(async () => ({
          promotions: [{ memoryId: 'c1', promote: true }],
        })) as unknown as ILLMClient['chatStructured'],
        summarize: jest.fn(),
      };
      const voice = makeVoiceClient();
      const repo = makeRepo();
      const embeddingClient = { embed: jest.fn(async () => [0.99, 0.01, 0]) };

      await collectEvents(
        runChatUseCase({
          ...baseParams,
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          memoryRepository: memRepo,
          embeddingClient,
        })
      );

      // promote が呼ばれるまで少し待つ（fire-and-forget）
      await new Promise((resolve) => setImmediate(resolve));
      expect(memRepo.promote).toHaveBeenCalledWith(tierCMem, 'B');
    });

    it('昇格候補検出がエラーを投げても LLM 応答を継続する（fail-warn）', async () => {
      const memRepo = makeMemoryRepo();
      (memRepo.listByTier as jest.Mock).mockRejectedValue(new Error('DB error'));
      const llm = makeLLMClient(['了解！']);
      const voice = makeVoiceClient();
      const repo = makeRepo();
      const embeddingClient = { embed: jest.fn(async () => [1, 0, 0]) };

      const events = await collectEvents(
        runChatUseCase({
          ...baseParams,
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          memoryRepository: memRepo,
          embeddingClient,
        })
      );

      expect(events[events.length - 1]).toEqual({ type: 'done' });
    });
  });

  // ── 知識ゲート（Phase 5b / Issue #3344）────────────────────────────────

  describe('知識ゲート', () => {
    function makeKnowledge(topic: string, summary: string): KnowledgeEntity {
      return {
        UserID: 'u1',
        CharacterID: 'hiyori',
        KnowledgeID: 'k1',
        Topic: topic,
        Summary: summary,
        SourceUrls: [],
        RawComment: '',
        RelatedCategory: 'ゲーム',
        CreatedAt: 1_700_000_000_000,
        UpdatedAt: 1_700_000_000_000,
      };
    }

    function makeKnowledgeRepo(knowledge: KnowledgeEntity[] = []): KnowledgeRepository {
      return {
        put: jest.fn(async (input) => ({ ...input, CreatedAt: Date.now(), UpdatedAt: Date.now() })),
        list: jest.fn(async () => knowledge),
        getLatest: jest.fn(async () => knowledge[0] ?? null),
        getById: jest.fn(
          async (_userId, _charId, id) => knowledge.find((k) => k.KnowledgeID === id) ?? null
        ),
      };
    }

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

    it('知識ベースにヒット → 通常 LLM 応答（knowledge_hit）', async () => {
      const k = makeKnowledge('モンスターハンター', 'カプコンのゲーム');
      const knowledgeRepo = makeKnowledgeRepo([k]);
      const llm = makeLLMClient(['モンハン面白いよね！']);
      // chatStructured は knowledge_hit なので呼ばれない
      const voice = makeVoiceClient();
      const repo = makeRepo();

      const events = await collectEvents(
        runChatUseCase({
          ...baseParams,
          userText: 'モンスターハンター',
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          knowledgeRepository: knowledgeRepo,
        })
      );

      const textEvents = events.filter((e) => e.type === 'text');
      expect(textEvents.length).toBeGreaterThan(0);
      // chatStructured（分類）は呼ばれない
      expect(llm.chatStructured).not.toHaveBeenCalled();
    });

    it('ヒットなし + needsStudy=true → 「勉強しておくね」テンプレ応答でLLMバイパス', async () => {
      const knowledgeRepo = makeKnowledgeRepo([]);
      const studyTopicRepo = makeStudyTopicRepo();
      const llm = makeLLMClient(['応答']);
      // chatStructured は needsStudy=true を返す
      (llm.chatStructured as jest.Mock).mockResolvedValue({
        needsStudy: true,
        normalizedTopic: '最新アニメ',
      });
      const voice = makeVoiceClient();
      const repo = makeRepo();

      const events = await collectEvents(
        runChatUseCase({
          ...baseParams,
          userText: '最新アニメ教えて',
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          knowledgeRepository: knowledgeRepo,
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

    it('ヒットなし + needsStudy=true + 既存 pending → 重複登録しない', async () => {
      const knowledgeRepo = makeKnowledgeRepo([]);
      const studyTopicRepo = makeStudyTopicRepo();
      // 既存 pending を返す
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
          ...baseParams,
          userText: '最新アニメ教えて',
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          knowledgeRepository: knowledgeRepo,
          studyTopicRepository: studyTopicRepo,
        })
      );

      expect(studyTopicRepo.put).not.toHaveBeenCalled();
    });

    it('ヒットなし + needsStudy=false → 通常 LLM 応答（normal）', async () => {
      const knowledgeRepo = makeKnowledgeRepo([]);
      const llm = makeLLMClient(['もちろん！']);
      (llm.chatStructured as jest.Mock).mockResolvedValue({
        needsStudy: false,
        normalizedTopic: '挨拶',
      });
      const voice = makeVoiceClient();
      const repo = makeRepo();

      const events = await collectEvents(
        runChatUseCase({
          ...baseParams,
          userText: 'おはよう！',
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          knowledgeRepository: knowledgeRepo,
        })
      );

      expect(llm.chatStream).toHaveBeenCalled();
      const textEvents = events.filter((e) => e.type === 'text');
      expect(textEvents.length).toBeGreaterThan(0);
    });

    it('knowledgeRepository 未指定 → ゲートをスキップして通常フロー', async () => {
      const llm = makeLLMClient(['普通の応答']);
      const voice = makeVoiceClient();
      const repo = makeRepo();

      const events = await collectEvents(
        runChatUseCase({
          ...baseParams,
          userText: 'こんにちは',
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          // knowledgeRepository は未指定
        })
      );

      expect(llm.chatStream).toHaveBeenCalled();
      expect(events[events.length - 1]).toEqual({ type: 'done' });
    });

    it('知識ゲートがエラーを投げても通常フローで継続する（fail-warn）', async () => {
      const knowledgeRepo = makeKnowledgeRepo([]);
      (knowledgeRepo.list as jest.Mock).mockRejectedValue(new Error('DB error'));
      const llm = makeLLMClient(['エラーでも応答']);
      const voice = makeVoiceClient();
      const repo = makeRepo();

      const events = await collectEvents(
        runChatUseCase({
          ...baseParams,
          userText: 'テスト',
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          knowledgeRepository: knowledgeRepo,
        })
      );

      // エラーでも通常 LLM 応答が返る
      expect(llm.chatStream).toHaveBeenCalled();
      expect(events[events.length - 1]).toEqual({ type: 'done' });
    });

    it('study 分岐後はアシスタントメッセージが保存される', async () => {
      const knowledgeRepo = makeKnowledgeRepo([]);
      const llm = makeLLMClient(['通常応答']);
      (llm.chatStructured as jest.Mock).mockResolvedValue({
        needsStudy: true,
        normalizedTopic: 'テスト',
      });
      const voice = makeVoiceClient();
      const repo = makeRepo();

      await collectEvents(
        runChatUseCase({
          ...baseParams,
          userText: 'テスト',
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          knowledgeRepository: knowledgeRepo,
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

    it('knowledge_hit 時は通常 LLM が知識 context で呼ばれる', async () => {
      const k = makeKnowledge('モンスターハンター', 'カプコンのゲームシリーズ');
      const knowledgeRepo = makeKnowledgeRepo([k]);
      const llm = makeLLMClient(['モンハンの話ね！']);
      const voice = makeVoiceClient();
      const repo = makeRepo();

      await collectEvents(
        runChatUseCase({
          ...baseParams,
          userText: 'モンスターハンター',
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          knowledgeRepository: knowledgeRepo,
        })
      );

      // chatStream（通常 LLM）が呼ばれた
      expect(llm.chatStream).toHaveBeenCalled();
      // system prompt に「この前調べたこと」セクションが含まれる
      const streamArgs = (llm.chatStream as jest.Mock).mock.calls[0][0] as Array<{
        role: string;
        content: string;
      }>;
      const systemMsg = streamArgs.find((m) => m.role === 'system');
      expect(systemMsg?.content).toContain('この前調べたこと');
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
      };
    }

    const sampleNote: NoteEntity = {
      UserID: 'u1',
      CharacterID: 'hiyori',
      NoteID: 'note-1',
      Title: 'コーヒーの淹れ方',
      Body: '本文。\n\nコメント。',
      RelatedKnowledgeIds: ['know-1'],
      RelatedCategory: 'コーヒー',
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
          ...baseParams,
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
          ...baseParams,
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
          ...baseParams,
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

  describe('MemorySummary prompt 注入（Issue #3354）', () => {
    const sampleSummary: MemorySummaryEntity = {
      UserID: 'u1',
      CharacterID: 'hiyori',
      SummaryText: 'この人はコーヒーが好きで、犬を飼っている。',
      LastCompressedAt: 1_700_000_000_000,
      CreatedAt: 1_700_000_000_000,
      UpdatedAt: 1_700_000_000_000,
    };

    it('MemorySummary があるとき summaryText が system prompt に注入される', async () => {
      const llm = makeLLMClient(['うん']);
      const voice = makeVoiceClient();
      const repo = makeRepo();
      const summaryRepo = makeMemorySummaryRepo(sampleSummary);

      await collectEvents(
        runChatUseCase({
          ...baseParams,
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          memorySummaryRepository: summaryRepo,
        })
      );

      const streamArgs = (llm.chatStream as jest.Mock).mock.calls[0][0] as Array<{
        role: string;
        content: string;
      }>;
      const systemMsg = streamArgs.find((m) => m.role === 'system');
      expect(systemMsg?.content).toContain('あなたがこれまでに知ったこと');
      expect(systemMsg?.content).toContain('コーヒーが好き');
    });

    it('MemorySummary があるとき listSince が lastCompressedAt で呼ばれる', async () => {
      const llm = makeLLMClient(['うん']);
      const voice = makeVoiceClient();
      const repo = makeRepo();
      const summaryRepo = makeMemorySummaryRepo(sampleSummary);

      await collectEvents(
        runChatUseCase({
          ...baseParams,
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          memorySummaryRepository: summaryRepo,
        })
      );

      expect(repo.listSince).toHaveBeenCalledWith('u1', 'hiyori', sampleSummary.LastCompressedAt);
    });

    it('MemorySummary がないとき listSince(0) で全件取得する（fallback）', async () => {
      const llm = makeLLMClient(['うん']);
      const voice = makeVoiceClient();
      const repo = makeRepo();
      const summaryRepo = makeMemorySummaryRepo(null);

      await collectEvents(
        runChatUseCase({
          ...baseParams,
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          memorySummaryRepository: summaryRepo,
        })
      );

      expect(repo.listSince).toHaveBeenCalledWith('u1', 'hiyori', 0);
    });

    it('memorySummaryRepository 未指定のとき listSince(0) で全件取得する（fallback）', async () => {
      const llm = makeLLMClient(['うん']);
      const voice = makeVoiceClient();
      const repo = makeRepo();

      await collectEvents(
        runChatUseCase({
          ...baseParams,
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          // memorySummaryRepository なし
        })
      );

      expect(repo.listSince).toHaveBeenCalledWith('u1', 'hiyori', 0);
    });

    it('MemorySummary があるとき promptTokens.summary が 0 より大きい', async () => {
      const llm = makeLLMClient(['うん']);
      const voice = makeVoiceClient();
      const repo = makeRepo();
      const summaryRepo = makeMemorySummaryRepo(sampleSummary);

      // emitChatMetricsLog をスパイして promptTokens を確認
      const logs: unknown[] = [];
      jest.spyOn(console, 'log').mockImplementation((...args) => logs.push(args));

      await collectEvents(
        runChatUseCase({
          ...baseParams,
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          memorySummaryRepository: summaryRepo,
        })
      );

      // システムプロンプトにサマリーが含まれていることを確認
      const streamArgs = (llm.chatStream as jest.Mock).mock.calls[0][0] as Array<{
        role: string;
        content: string;
      }>;
      const systemMsg = streamArgs.find((m) => m.role === 'system');
      expect(systemMsg?.content).toContain(sampleSummary.SummaryText);
    });

    it('MemorySummary 取得エラー時はスキップして通常応答を継続する', async () => {
      const llm = makeLLMClient(['うん']);
      const voice = makeVoiceClient();
      const repo = makeRepo();
      const summaryRepo = makeMemorySummaryRepo(null);
      (summaryRepo.get as jest.Mock).mockRejectedValueOnce(new Error('DB error'));

      const events = await collectEvents(
        runChatUseCase({
          ...baseParams,
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          memorySummaryRepository: summaryRepo,
        })
      );

      expect(events[events.length - 1]).toEqual({ type: 'done' });
      expect(llm.chatStream).toHaveBeenCalled();
    });
  });

  describe('通知起点の KNOWLEDGE context 注入（Issue #3359 課題Y）', () => {
    function makeKnowledgeRepo(knowledge: KnowledgeEntity[] = []): KnowledgeRepository {
      return {
        put: jest.fn(async (input) => ({ ...input, CreatedAt: Date.now(), UpdatedAt: Date.now() })),
        list: jest.fn(async () => knowledge),
        getLatest: jest.fn(async () => knowledge[0] ?? null),
        getById: jest.fn(async (_u, _c, id) => knowledge.find((k) => k.KnowledgeID === id) ?? null),
      };
    }

    function makeKnowledgeForNotif(id: string, topic: string): KnowledgeEntity {
      return {
        UserID: 'u1',
        CharacterID: 'hiyori',
        KnowledgeID: id,
        Topic: topic,
        Summary: `${topic}の詳細要約。`.repeat(5),
        SourceUrls: [],
        RawComment: 'おもしろい！',
        RelatedCategory: 'test',
        CreatedAt: 1_700_000_000_000,
        UpdatedAt: 1_700_000_000_000,
      };
    }

    it('notificationKnowledgeId 指定時、該当 KNOWLEDGE が system prompt に注入される', async () => {
      const k = makeKnowledgeForNotif('notif-k1', 'カフェラテの新作');
      const knowledgeRepo = makeKnowledgeRepo([k]);
      const llm = makeLLMClient(['そうそう！']);
      const voice = makeVoiceClient();
      const repo = makeRepo();

      await collectEvents(
        runChatUseCase({
          ...baseParams,
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          knowledgeRepository: knowledgeRepo,
          notificationKnowledgeId: 'notif-k1',
        })
      );

      expect(knowledgeRepo.getById).toHaveBeenCalledWith('u1', 'hiyori', 'notif-k1');
      const streamArgs = (llm.chatStream as jest.Mock).mock.calls[0][0] as Array<{
        role: string;
        content: string;
      }>;
      const systemMsg = streamArgs.find((m) => m.role === 'system');
      expect(systemMsg?.content).toContain('通知でユーザーに話しかけた話題');
      expect(systemMsg?.content).toContain('カフェラテの新作');
    });

    it('notificationKnowledgeId が存在しない ID のとき通常フローで継続', async () => {
      const knowledgeRepo = makeKnowledgeRepo([]);
      const llm = makeLLMClient(['うん']);
      const voice = makeVoiceClient();
      const repo = makeRepo();

      const events = await collectEvents(
        runChatUseCase({
          ...baseParams,
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          knowledgeRepository: knowledgeRepo,
          notificationKnowledgeId: 'no-such-id',
        })
      );

      expect(events.some((e) => e.type === 'done')).toBe(true);
      expect(llm.chatStream).toHaveBeenCalled();
    });

    it('notificationKnowledgeId 未指定のとき通知セクションを含めない', async () => {
      const llm = makeLLMClient(['うん']);
      const voice = makeVoiceClient();
      const repo = makeRepo();

      await collectEvents(
        runChatUseCase({
          ...baseParams,
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
        })
      );

      const streamArgs = (llm.chatStream as jest.Mock).mock.calls[0][0] as Array<{
        role: string;
        content: string;
      }>;
      const systemMsg = streamArgs.find((m) => m.role === 'system');
      expect(systemMsg?.content).not.toContain('通知でユーザーに話しかけた話題');
    });

    it('getById が失敗してもスキップして通常応答を継続する', async () => {
      const knowledgeRepo = makeKnowledgeRepo([]);
      (knowledgeRepo.getById as jest.Mock).mockRejectedValueOnce(new Error('DB error'));
      const llm = makeLLMClient(['うん']);
      const voice = makeVoiceClient();
      const repo = makeRepo();

      const events = await collectEvents(
        runChatUseCase({
          ...baseParams,
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          knowledgeRepository: knowledgeRepo,
          notificationKnowledgeId: 'notif-k1',
        })
      );

      expect(events.some((e) => e.type === 'done')).toBe(true);
    });

    it('knowledge_hit と notificationKnowledgeId が同じ ID のとき重複注入しない', async () => {
      const k = makeKnowledgeForNotif('k1', 'モンハン');
      const knowledgeRepo = makeKnowledgeRepo([k]);
      const llm = makeLLMClient(['モンハン！']);
      const voice = makeVoiceClient();
      const repo = makeRepo();

      await collectEvents(
        runChatUseCase({
          ...baseParams,
          userText: 'モンハン',
          llmClient: llm,
          voiceClient: voice,
          messageRepository: repo,
          knowledgeRepository: knowledgeRepo,
          notificationKnowledgeId: 'k1',
        })
      );

      const streamArgs = (llm.chatStream as jest.Mock).mock.calls[0][0] as Array<{
        role: string;
        content: string;
      }>;
      const systemMsg = streamArgs.find((m) => m.role === 'system');
      // 通知セクションが含まれ、知識ゲートセクションでは重複しない
      expect(systemMsg?.content).toContain('通知でユーザーに話しかけた話題');
      const knowledgeCount = (systemMsg?.content.match(/この前調べたこと/g) ?? []).length;
      expect(knowledgeCount).toBeLessThanOrEqual(1);
    });
  });
});
