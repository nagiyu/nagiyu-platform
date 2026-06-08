import { VoicevoxClient, VOICEVOX_ERROR_MESSAGES } from '../../../src/voicevox/voicevox-client.js';

type MockResponseInit = {
  ok?: boolean;
  status?: number;
  jsonBody?: unknown;
  arrayBufferBody?: ArrayBuffer;
};

function mockResponse(init: MockResponseInit): Response {
  const { ok = true, status = 200, jsonBody, arrayBufferBody } = init;
  return {
    ok,
    status,
    json: async () => jsonBody,
    arrayBuffer: async () => arrayBufferBody ?? new ArrayBuffer(0),
  } as unknown as Response;
}

describe('VoicevoxClient', () => {
  const sampleQuery = { accent_phrases: [], speedScale: 1.0 };
  const sampleAudio = new ArrayBuffer(8);

  it('synthesize は audio_query と synthesis を順に呼び、ArrayBuffer を返す', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchMock: typeof fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      calls.push({ url, init });
      if (url.includes('/audio_query')) {
        return mockResponse({ jsonBody: sampleQuery });
      }
      return mockResponse({ arrayBufferBody: sampleAudio });
    };

    const client = new VoicevoxClient({
      baseUrl: 'http://example.com',
      fetch: fetchMock,
    });
    const result = await client.synthesize('こんにちは');

    expect(result).toBe(sampleAudio);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe(
      'http://example.com/audio_query?text=%E3%81%93%E3%82%93%E3%81%AB%E3%81%A1%E3%81%AF&speaker=14'
    );
    expect(calls[0].init.method).toBe('POST');
    expect(calls[1].url).toBe('http://example.com/synthesis?speaker=14');
    expect(calls[1].init.method).toBe('POST');
    expect(calls[1].init.body).toBe(JSON.stringify(sampleQuery));
  });

  it('既定の baseUrl と speakerId が使われる', async () => {
    const calls: string[] = [];
    const fetchMock: typeof fetch = async (input) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      calls.push(url);
      if (url.includes('/audio_query')) {
        return mockResponse({ jsonBody: sampleQuery });
      }
      return mockResponse({ arrayBufferBody: sampleAudio });
    };

    const client = new VoicevoxClient({ fetch: fetchMock });
    await client.synthesize('やあ');

    expect(calls[0]).toContain('http://localhost:50021/audio_query');
    expect(calls[0]).toContain('speaker=14');
  });

  it('baseUrl の末尾スラッシュを取り除く', async () => {
    const calls: string[] = [];
    const fetchMock: typeof fetch = async (input) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      calls.push(url);
      if (url.includes('/audio_query')) {
        return mockResponse({ jsonBody: sampleQuery });
      }
      return mockResponse({ arrayBufferBody: sampleAudio });
    };

    const client = new VoicevoxClient({ baseUrl: 'http://example.com/', fetch: fetchMock });
    await client.synthesize('テスト');

    expect(calls[0].startsWith('http://example.com/audio_query')).toBe(true);
  });

  it('VoiceConfig で speakerId を指定できる', async () => {
    const calls: string[] = [];
    const fetchMock: typeof fetch = async (input) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      calls.push(url);
      if (url.includes('/audio_query')) {
        return mockResponse({ jsonBody: sampleQuery });
      }
      return mockResponse({ arrayBufferBody: sampleAudio });
    };

    const client = new VoicevoxClient({ fetch: fetchMock });
    await client.synthesize('テスト', { provider: 'voicevox', speakerId: 3 });

    expect(calls[0]).toContain('speaker=3');
    expect(calls[1]).toContain('speaker=3');
  });

  it('voice 省略時は既定話者（14）を使用する', async () => {
    const calls: string[] = [];
    const fetchMock: typeof fetch = async (input) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      calls.push(url);
      if (url.includes('/audio_query')) {
        return mockResponse({ jsonBody: sampleQuery });
      }
      return mockResponse({ arrayBufferBody: sampleAudio });
    };

    const client = new VoicevoxClient({ fetch: fetchMock });
    await client.synthesize('テスト');

    expect(calls[0]).toContain('speaker=14');
    expect(calls[1]).toContain('speaker=14');
  });

  it('空文字は EMPTY_TEXT で reject される', async () => {
    const fetchMock = jest.fn();
    const client = new VoicevoxClient({ fetch: fetchMock as unknown as typeof fetch });

    await expect(client.synthesize('   ')).rejects.toThrow(VOICEVOX_ERROR_MESSAGES.EMPTY_TEXT);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('audio_query が失敗すると AUDIO_QUERY_FAILED を投げる', async () => {
    const fetchMock: typeof fetch = async () => mockResponse({ ok: false, status: 500 });
    const client = new VoicevoxClient({ fetch: fetchMock });

    await expect(client.synthesize('テスト')).rejects.toThrow(
      `${VOICEVOX_ERROR_MESSAGES.AUDIO_QUERY_FAILED}: HTTP 500`
    );
  });

  it('synthesis が失敗すると SYNTHESIS_FAILED を投げる', async () => {
    const fetchMock: typeof fetch = async (input) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url.includes('/audio_query')) {
        return mockResponse({ jsonBody: sampleQuery });
      }
      return mockResponse({ ok: false, status: 503 });
    };
    const client = new VoicevoxClient({ fetch: fetchMock });

    await expect(client.synthesize('テスト')).rejects.toThrow(
      `${VOICEVOX_ERROR_MESSAGES.SYNTHESIS_FAILED}: HTTP 503`
    );
  });

  it('AbortError は TIMEOUT メッセージに変換される', async () => {
    const fetchMock: typeof fetch = async () => {
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    };
    const client = new VoicevoxClient({ fetch: fetchMock, timeoutMs: 10 });

    await expect(client.synthesize('テスト')).rejects.toThrow(VOICEVOX_ERROR_MESSAGES.TIMEOUT);
  });

  it('AbortError 以外のエラーはそのまま伝播する', async () => {
    const fetchMock: typeof fetch = async () => {
      throw new Error('connection refused');
    };
    const client = new VoicevoxClient({ fetch: fetchMock });

    await expect(client.synthesize('テスト')).rejects.toThrow('connection refused');
  });
});
