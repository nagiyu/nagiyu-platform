import { renderHook, act } from '@testing-library/react';
import { useAudioQueue } from '@/lib/audio/useAudioQueue';

/** テスト用のダミー AudioBuffer を生成する */
function makeDummyBuffer(id: number = 0): AudioBuffer {
  return { id } as unknown as AudioBuffer;
}

describe('useAudioQueue', () => {
  describe('初期状態', () => {
    it('初期値は audioBuffer が null', () => {
      const onDrained = jest.fn();
      const { result } = renderHook(() => useAudioQueue({ onDrained }));
      expect(result.current.audioBuffer).toBeNull();
    });

    it('reset 直後に onDrained が発火しないこと（streamDone=false なので）', () => {
      const onDrained = jest.fn();
      const { result } = renderHook(() => useAudioQueue({ onDrained }));

      act(() => {
        result.current.reset();
      });

      expect(onDrained).not.toHaveBeenCalled();
    });
  });

  describe('enqueue', () => {
    it('enqueue するとキューが空なので即 current（audioBuffer）になる', () => {
      const onDrained = jest.fn();
      const { result } = renderHook(() => useAudioQueue({ onDrained }));
      const buf = makeDummyBuffer(1);

      act(() => {
        result.current.enqueue(buf);
      });

      expect(result.current.audioBuffer).toBe(buf);
    });

    it('再生中に enqueue するとキューに積まれ current は変わらない', () => {
      const onDrained = jest.fn();
      const { result } = renderHook(() => useAudioQueue({ onDrained }));
      const buf1 = makeDummyBuffer(1);
      const buf2 = makeDummyBuffer(2);

      act(() => {
        result.current.enqueue(buf1);
      });
      act(() => {
        result.current.enqueue(buf2);
      });

      // current は最初に enqueue した buf1 のまま
      expect(result.current.audioBuffer).toBe(buf1);
    });
  });

  describe('handlePlaybackEnd', () => {
    it('handlePlaybackEnd で次の buf に進む', () => {
      const onDrained = jest.fn();
      const { result } = renderHook(() => useAudioQueue({ onDrained }));
      const buf1 = makeDummyBuffer(1);
      const buf2 = makeDummyBuffer(2);

      act(() => {
        result.current.enqueue(buf1);
        result.current.enqueue(buf2);
      });

      act(() => {
        result.current.handlePlaybackEnd();
      });

      expect(result.current.audioBuffer).toBe(buf2);
    });

    it('キューが空のとき handlePlaybackEnd で audioBuffer が null になる', () => {
      const onDrained = jest.fn();
      const { result } = renderHook(() => useAudioQueue({ onDrained }));
      const buf = makeDummyBuffer(1);

      act(() => {
        result.current.enqueue(buf);
      });
      act(() => {
        result.current.handlePlaybackEnd();
      });

      expect(result.current.audioBuffer).toBeNull();
    });
  });

  describe('handlePlaybackError', () => {
    it('handlePlaybackError でも advance する（次の buf に進む）', () => {
      const onDrained = jest.fn();
      const { result } = renderHook(() => useAudioQueue({ onDrained }));
      const buf1 = makeDummyBuffer(1);
      const buf2 = makeDummyBuffer(2);

      act(() => {
        result.current.enqueue(buf1);
        result.current.enqueue(buf2);
      });
      act(() => {
        result.current.handlePlaybackError();
      });

      expect(result.current.audioBuffer).toBe(buf2);
    });

    it('キューが空のとき handlePlaybackError で audioBuffer が null になる', () => {
      const onDrained = jest.fn();
      const { result } = renderHook(() => useAudioQueue({ onDrained }));
      const buf = makeDummyBuffer(1);

      act(() => {
        result.current.enqueue(buf);
      });
      act(() => {
        result.current.handlePlaybackError();
      });

      expect(result.current.audioBuffer).toBeNull();
    });
  });

  describe('markStreamDone と onDrained', () => {
    it('markStreamDone 後にキュー空・current=null なら onDrained が発火する', () => {
      const onDrained = jest.fn();
      const { result } = renderHook(() => useAudioQueue({ onDrained }));

      act(() => {
        result.current.markStreamDone();
      });

      expect(onDrained).toHaveBeenCalledTimes(1);
    });

    it('再生中に markStreamDone しても onDrained は発火しない（current があるため）', () => {
      const onDrained = jest.fn();
      const { result } = renderHook(() => useAudioQueue({ onDrained }));
      const buf = makeDummyBuffer(1);

      act(() => {
        result.current.enqueue(buf);
        result.current.markStreamDone();
      });

      // current が buf なので drain しない
      expect(onDrained).not.toHaveBeenCalled();
    });

    it('再生完了後に streamDone 済みなら onDrained が発火する', () => {
      const onDrained = jest.fn();
      const { result } = renderHook(() => useAudioQueue({ onDrained }));
      const buf = makeDummyBuffer(1);

      act(() => {
        result.current.enqueue(buf);
        result.current.markStreamDone();
      });
      act(() => {
        result.current.handlePlaybackEnd();
      });

      expect(onDrained).toHaveBeenCalledTimes(1);
    });

    it('連続 enqueue → 全再生完了 → markStreamDone で onDrained 発火', () => {
      const onDrained = jest.fn();
      const { result } = renderHook(() => useAudioQueue({ onDrained }));
      const buf1 = makeDummyBuffer(1);
      const buf2 = makeDummyBuffer(2);

      act(() => {
        result.current.enqueue(buf1);
        result.current.enqueue(buf2);
      });
      act(() => {
        result.current.handlePlaybackEnd(); // buf1 → buf2
      });
      act(() => {
        result.current.handlePlaybackEnd(); // buf2 → null
      });
      act(() => {
        result.current.markStreamDone();
      });

      expect(onDrained).toHaveBeenCalledTimes(1);
      expect(result.current.audioBuffer).toBeNull();
    });

    it('キューにまだバッファがある間は markStreamDone で onDrained が発火しない', () => {
      const onDrained = jest.fn();
      const { result } = renderHook(() => useAudioQueue({ onDrained }));
      const buf1 = makeDummyBuffer(1);
      const buf2 = makeDummyBuffer(2);

      act(() => {
        result.current.enqueue(buf1);
        result.current.enqueue(buf2);
        result.current.markStreamDone();
      });

      // current=buf1, queue=[buf2] → まだ drain しない
      expect(onDrained).not.toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('reset でキューと current と streamDone がクリアされる', () => {
      const onDrained = jest.fn();
      const { result } = renderHook(() => useAudioQueue({ onDrained }));
      const buf = makeDummyBuffer(1);

      act(() => {
        result.current.enqueue(buf);
        result.current.markStreamDone();
      });
      // markStreamDone で onDrained が 1 回発火したのでリセット
      onDrained.mockClear();

      act(() => {
        result.current.reset();
      });

      expect(result.current.audioBuffer).toBeNull();
      // reset 後は streamDone=false なので onDrained は発火しない
      expect(onDrained).not.toHaveBeenCalled();
    });

    it('reset 後に enqueue → markStreamDone で再び onDrained が発火する', () => {
      const onDrained = jest.fn();
      const { result } = renderHook(() => useAudioQueue({ onDrained }));

      act(() => {
        result.current.markStreamDone();
      });
      expect(onDrained).toHaveBeenCalledTimes(1);
      onDrained.mockClear();

      act(() => {
        result.current.reset();
      });

      act(() => {
        result.current.markStreamDone();
      });

      expect(onDrained).toHaveBeenCalledTimes(1);
    });
  });

  describe('onDrained 参照変更による誤発火防止', () => {
    it('onDrained コールバックが毎レンダーで新しい参照になっても誤発火しない', () => {
      let callCount = 0;
      // rerenderで毎回新しい関数参照を渡す
      const { result, rerender } = renderHook(
        ({ cb }: { cb: () => void }) => useAudioQueue({ onDrained: cb }),
        { initialProps: { cb: () => callCount++ } }
      );

      // コールバック参照を変えて rerender
      rerender({ cb: () => callCount++ });
      rerender({ cb: () => callCount++ });

      // rerender だけでは onDrained は発火しない
      expect(callCount).toBe(0);

      // 正常なトリガーでのみ発火する
      act(() => {
        result.current.markStreamDone();
      });
      expect(callCount).toBe(1);
    });
  });

  describe('順序保証', () => {
    it('複数 enqueue したバッファが enqueue 順に再生される', () => {
      const onDrained = jest.fn();
      const { result } = renderHook(() => useAudioQueue({ onDrained }));
      const buf1 = makeDummyBuffer(1);
      const buf2 = makeDummyBuffer(2);
      const buf3 = makeDummyBuffer(3);

      act(() => {
        result.current.enqueue(buf1);
        result.current.enqueue(buf2);
        result.current.enqueue(buf3);
      });

      // 再生順: buf1 → buf2 → buf3
      expect(result.current.audioBuffer).toBe(buf1);

      act(() => {
        result.current.handlePlaybackEnd();
      });
      expect(result.current.audioBuffer).toBe(buf2);

      act(() => {
        result.current.handlePlaybackEnd();
      });
      expect(result.current.audioBuffer).toBe(buf3);

      act(() => {
        result.current.handlePlaybackEnd();
      });
      expect(result.current.audioBuffer).toBeNull();
    });
  });
});
