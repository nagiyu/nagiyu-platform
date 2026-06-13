import { renderHook, act, waitFor } from '@testing-library/react';
import { useFirstWord } from '@/lib/home/useFirstWord';

// useSearchParams をモック化
const mockSearchParamsGet = jest.fn().mockReturnValue(null);
jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(() => ({
    get: mockSearchParamsGet,
  })),
}));

afterEach(() => {
  jest.clearAllMocks();
  mockSearchParamsGet.mockReturnValue(null);
});

describe('useFirstWord', () => {
  describe('初期値', () => {
    it('初期状態は firstWordText と prefillText が null', () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false });
      const { result } = renderHook(() => useFirstWord('hiyori'));
      expect(result.current.firstWordText).toBeNull();
      expect(result.current.prefillText).toBeNull();
    });
  });

  describe('first-word 取得', () => {
    it('characterId 付きで /api/push/first-word を取得する', async () => {
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.startsWith('/api/push/first-word')) {
          return Promise.resolve({ ok: false });
        }
        return Promise.resolve({ ok: true });
      });
      renderHook(() => useFirstWord('hiyori'));

      await waitFor(() => {
        const calls = (global.fetch as jest.Mock).mock.calls.map(([url]: [string]) => url);
        expect(calls.some((url) => url.includes('/api/push/first-word?characterId=hiyori'))).toBe(
          true
        );
      });
    });

    it('ok: true かつデータあり → firstWordText が設定される', async () => {
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.startsWith('/api/push/first-word')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                notifId: 'n1',
                body: 'テスト第一声',
                knowledgeId: 'k-xyz',
                characterId: 'hiyori',
              }),
          });
        }
        if (url === '/api/push/consumed') {
          return Promise.resolve({ ok: true });
        }
        return Promise.resolve({ ok: true });
      });

      const { result } = renderHook(() => useFirstWord('hiyori'));
      await waitFor(() => expect(result.current.firstWordText).toBe('テスト第一声'));
    });

    it('ok: false のとき firstWordText は null のまま', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false });
      const { result } = renderHook(() => useFirstWord('hiyori'));
      await act(async () => {});
      expect(result.current.firstWordText).toBeNull();
    });

    it('取得成功時に /api/push/consumed が PATCH で呼ばれる', async () => {
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.startsWith('/api/push/first-word')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                notifId: 'n1',
                body: '第一声',
                knowledgeId: null,
                characterId: 'hiyori',
              }),
          });
        }
        if (url === '/api/push/consumed') {
          return Promise.resolve({ ok: true });
        }
        return Promise.resolve({ ok: true });
      });

      renderHook(() => useFirstWord('hiyori'));
      await waitFor(() => {
        const consumedCall = (global.fetch as jest.Mock).mock.calls.find(
          ([url]: [string]) => url === '/api/push/consumed'
        );
        expect(consumedCall).toBeDefined();
        expect(consumedCall[1].method).toBe('PATCH');
        const body = JSON.parse(consumedCall[1].body as string);
        expect(body.notifId).toBe('n1');
      });
    });

    it('fetch 失敗時はクラッシュしない', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ネットワークエラー'));
      const { result } = renderHook(() => useFirstWord('hiyori'));
      await act(async () => {});
      expect(result.current.firstWordText).toBeNull();
    });
  });

  describe('characterId が変わったとき', () => {
    it('characterId が変わると再 fetch し前の firstWordText がクリアされる', async () => {
      let callCount = 0;
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.startsWith('/api/push/first-word')) {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  notifId: 'n1',
                  body: 'ひよりの声',
                  knowledgeId: 'k1',
                  characterId: 'hiyori',
                }),
            });
          }
          return Promise.resolve({ ok: false });
        }
        if (url === '/api/push/consumed') {
          return Promise.resolve({ ok: true });
        }
        return Promise.resolve({ ok: true });
      });

      const { result, rerender } = renderHook(({ characterId }) => useFirstWord(characterId), {
        initialProps: { characterId: 'hiyori' },
      });

      await waitFor(() => expect(result.current.firstWordText).toBe('ひよりの声'));

      rerender({ characterId: 'ageha' });

      // キャラ切替直後に null になる（effect の先頭でクリア）
      expect(result.current.firstWordText).toBeNull();
    });
  });

  describe('prefillText（from=push + suggestedReply）', () => {
    it('from=push かつ suggestedReply あり → prefillText が設定される', async () => {
      mockSearchParamsGet.mockImplementation((key: string) => {
        if (key === 'from') return 'push';
        return null;
      });
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.startsWith('/api/push/first-word')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                notifId: 'n1',
                body: '第一声',
                knowledgeId: 'k1',
                characterId: 'hiyori',
                suggestedReply: 'TypeScriptについて教えて',
              }),
          });
        }
        if (url === '/api/push/consumed') {
          return Promise.resolve({ ok: true });
        }
        return Promise.resolve({ ok: true });
      });

      const { result } = renderHook(() => useFirstWord('hiyori'));
      await waitFor(() => expect(result.current.prefillText).toBe('TypeScriptについて教えて'));
    });

    it('from=push でない場合は suggestedReply があっても prefillText が null のまま', async () => {
      mockSearchParamsGet.mockReturnValue(null);
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.startsWith('/api/push/first-word')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                notifId: 'n1',
                body: '第一声',
                knowledgeId: 'k1',
                characterId: 'hiyori',
                suggestedReply: '返信テキスト',
              }),
          });
        }
        if (url === '/api/push/consumed') {
          return Promise.resolve({ ok: true });
        }
        return Promise.resolve({ ok: true });
      });

      const { result } = renderHook(() => useFirstWord('hiyori'));
      await waitFor(() => expect(result.current.firstWordText).toBe('第一声'));
      expect(result.current.prefillText).toBeNull();
    });

    it('from=push でも suggestedReply が null なら prefillText は null のまま', async () => {
      mockSearchParamsGet.mockImplementation((key: string) => {
        if (key === 'from') return 'push';
        return null;
      });
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.startsWith('/api/push/first-word')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                notifId: 'n1',
                body: '第一声',
                knowledgeId: 'k1',
                characterId: 'hiyori',
                suggestedReply: null,
              }),
          });
        }
        if (url === '/api/push/consumed') {
          return Promise.resolve({ ok: true });
        }
        return Promise.resolve({ ok: true });
      });

      const { result } = renderHook(() => useFirstWord('hiyori'));
      await waitFor(() => expect(result.current.firstWordText).toBe('第一声'));
      expect(result.current.prefillText).toBeNull();
    });
  });

  describe('consumeKnowledgeId（クロス汚染防止ガード）', () => {
    it('カレントキャラ == 通知元キャラのとき knowledgeId を返し ref をクリアする', async () => {
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.startsWith('/api/push/first-word')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                notifId: 'n1',
                body: '第一声',
                knowledgeId: 'k-hiyori',
                characterId: 'hiyori',
              }),
          });
        }
        if (url === '/api/push/consumed') {
          return Promise.resolve({ ok: true });
        }
        return Promise.resolve({ ok: true });
      });

      const { result } = renderHook(() => useFirstWord('hiyori'));
      await waitFor(() => expect(result.current.firstWordText).toBe('第一声'));

      let knowledgeId: string | null = null;
      act(() => {
        knowledgeId = result.current.consumeKnowledgeId('hiyori');
      });

      // カレント == 通知元 → knowledgeId が返る
      expect(knowledgeId).toBe('k-hiyori');
    });

    it('2 回目の consumeKnowledgeId は null を返す（ref がクリアされている）', async () => {
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.startsWith('/api/push/first-word')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                notifId: 'n1',
                body: '第一声',
                knowledgeId: 'k-hiyori',
                characterId: 'hiyori',
              }),
          });
        }
        if (url === '/api/push/consumed') {
          return Promise.resolve({ ok: true });
        }
        return Promise.resolve({ ok: true });
      });

      const { result } = renderHook(() => useFirstWord('hiyori'));
      await waitFor(() => expect(result.current.firstWordText).toBe('第一声'));

      act(() => {
        result.current.consumeKnowledgeId('hiyori');
      });
      let secondKnowledgeId: string | null = null;
      act(() => {
        secondKnowledgeId = result.current.consumeKnowledgeId('hiyori');
      });

      expect(secondKnowledgeId).toBeNull();
    });

    it('カレントキャラ != 通知元キャラのとき null を返す（クロス汚染防止）', async () => {
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.startsWith('/api/push/first-word')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                notifId: 'n1',
                body: '第一声',
                knowledgeId: 'k-ageha',
                // 通知元は ageha だがカレントは hiyori でチェックする
                characterId: 'ageha',
              }),
          });
        }
        if (url === '/api/push/consumed') {
          return Promise.resolve({ ok: true });
        }
        return Promise.resolve({ ok: true });
      });

      const { result } = renderHook(() => useFirstWord('hiyori'));
      await waitFor(() => expect(result.current.firstWordText).toBe('第一声'));

      let knowledgeId: string | null = null;
      act(() => {
        // カレントキャラとして 'hiyori' を渡す（通知元は 'ageha'）
        knowledgeId = result.current.consumeKnowledgeId('hiyori');
      });

      // クロス汚染防止 → null
      expect(knowledgeId).toBeNull();
    });

    it('knowledgeId が null の first-word でも consumeKnowledgeId は null を返す', async () => {
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.startsWith('/api/push/first-word')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                notifId: 'n1',
                body: '第一声',
                knowledgeId: null,
                characterId: 'hiyori',
              }),
          });
        }
        if (url === '/api/push/consumed') {
          return Promise.resolve({ ok: true });
        }
        return Promise.resolve({ ok: true });
      });

      const { result } = renderHook(() => useFirstWord('hiyori'));
      await waitFor(() => expect(result.current.firstWordText).toBe('第一声'));

      let knowledgeId: string | null = null;
      act(() => {
        knowledgeId = result.current.consumeKnowledgeId('hiyori');
      });

      expect(knowledgeId).toBeNull();
    });
  });

  describe('clearFirstWordText', () => {
    it('clearFirstWordText を呼ぶと firstWordText が null になる', async () => {
      global.fetch = jest.fn().mockImplementation((url: string) => {
        if (url.startsWith('/api/push/first-word')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                notifId: 'n1',
                body: '第一声',
                knowledgeId: null,
                characterId: 'hiyori',
              }),
          });
        }
        if (url === '/api/push/consumed') {
          return Promise.resolve({ ok: true });
        }
        return Promise.resolve({ ok: true });
      });

      const { result } = renderHook(() => useFirstWord('hiyori'));
      await waitFor(() => expect(result.current.firstWordText).toBe('第一声'));

      act(() => {
        result.current.clearFirstWordText();
      });

      expect(result.current.firstWordText).toBeNull();
    });
  });
});
