import { runChatUseCase, type ChatEvent } from '../../../src/usecases/chat-usecase.js';
import { hiyori } from '../../../src/characters/hiyori.js';
import type { ILLMClient } from '../../../src/llm-client/types.js';
import type { IVoiceClient } from '../../../src/voicevox/types.js';
import type { MemoryRepository } from '../../../src/repositories/memory.repository.interface.js';
import type { MessageRepository } from '../../../src/repositories/message.repository.interface.js';
import type { SafetyEventRepository } from '../../../src/repositories/safety-event.repository.interface.js';
import type { MessageEntity } from '../../../src/entities/message.entity.js';
import type { MemoryEntity } from '../../../src/entities/memory.entity.js';
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
      messages: history,
      totalTokens: 0,
      truncated: false,
    })),
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
    retrieve: jest.fn(async () => memories),
  };
}

function makeMemoryRepo(): MemoryRepository {
  return {
    put: jest.fn(),
    get: jest.fn(async () => null),
    listByTier: jest.fn(async () => []),
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

    it('getRecentByTokenBudget はユーザー保存より前に呼ばれる', async () => {
      const callOrder: string[] = [];
      const repo = makeRepo([], {
        getRecentByTokenBudget: jest.fn(async () => {
          callOrder.push('getRecent');
          return { messages: [], totalTokens: 0, truncated: false };
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

      expect(callOrder[0]).toBe('getRecent');
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
});
