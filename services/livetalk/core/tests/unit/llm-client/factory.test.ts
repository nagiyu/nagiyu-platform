import { createLLMClient, FACTORY_ERROR_MESSAGES } from '../../../src/llm-client/factory.js';
import { OpenAIClient } from '../../../src/llm-client/openai-client.js';

const ORIGINAL_OPENAI_API_KEY = process.env.OPENAI_API_KEY;

describe('createLLMClient', () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  afterAll(() => {
    if (ORIGINAL_OPENAI_API_KEY === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = ORIGINAL_OPENAI_API_KEY;
    }
  });

  it('apiKey 直接指定で OpenAIClient を返す', () => {
    const client = createLLMClient({ openai: { apiKey: 'sk-test' } });
    expect(client).toBeInstanceOf(OpenAIClient);
  });

  it('process.env.OPENAI_API_KEY を fallback として使う', () => {
    process.env.OPENAI_API_KEY = 'sk-from-env';

    const client = createLLMClient({});

    expect(client).toBeInstanceOf(OpenAIClient);
  });

  it('openai.apiKey 明示指定が OPENAI_API_KEY env より優先される', () => {
    process.env.OPENAI_API_KEY = 'sk-from-env';

    const client = createLLMClient({ openai: { apiKey: 'sk-explicit' } });

    expect(client).toBeInstanceOf(OpenAIClient);
  });

  it('OPENAI_API_KEY が空文字なら MISSING_API_KEY を投げる', () => {
    process.env.OPENAI_API_KEY = '';

    expect(() => createLLMClient({})).toThrow(FACTORY_ERROR_MESSAGES.MISSING_API_KEY);
  });

  it('apiKey も env も無ければ MISSING_API_KEY を投げる', () => {
    expect(() => createLLMClient({})).toThrow(FACTORY_ERROR_MESSAGES.MISSING_API_KEY);
  });

  it('models 上書きが OpenAIClient に渡る（生成成功のみ確認）', () => {
    const client = createLLMClient({
      openai: { apiKey: 'sk-test', models: { conversation: 'gpt-x' } },
    });

    expect(client).toBeInstanceOf(OpenAIClient);
  });
});
