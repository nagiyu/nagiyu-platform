import { runChatUseCase, type ChatEvent } from '../../../src/usecases/chat-usecase.js';
import { hiyori } from '../../../src/characters/hiyori.js';
import type { ILLMClient } from '../../../src/llm-client/types.js';
import type { IVoiceClient } from '../../../src/voicevox/types.js';
import type { MessageRepository } from '../../../src/repositories/message.repository.interface.js';
import type { MessageEntity } from '../../../src/entities/message.entity.js';

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

// ── テスト本体 ──────────────────────────────────────────────────────────────

describe('runChatUseCase', () => {
  const baseParams = {
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
});
