/**
 * useEnterSubmit Hook テスト
 *
 * エンターキーによる確定処理と IME 誤発火防止の動作を検証する
 */

import { renderHook } from '@testing-library/react';
import { useEnterSubmit } from '../../src/hooks/useEnterSubmit';
import type { UseEnterSubmitOptions } from '../../src/hooks/useEnterSubmit';

/**
 * KeyboardEvent モックオブジェクトを生成するヘルパー
 */
function createKeyboardEvent(
  overrides: Partial<{
    key: string;
    keyCode: number;
    isComposing: boolean;
    shiftKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    altKey: boolean;
  }> = {}
): React.KeyboardEvent<HTMLInputElement> {
  const {
    key = 'Enter',
    keyCode = 13,
    isComposing = false,
    shiftKey = false,
    ctrlKey = false,
    metaKey = false,
    altKey = false,
  } = overrides;

  return {
    key,
    keyCode,
    shiftKey,
    ctrlKey,
    metaKey,
    altKey,
    nativeEvent: {
      isComposing,
    } as KeyboardEvent,
    preventDefault: jest.fn(),
  } as unknown as React.KeyboardEvent<HTMLInputElement>;
}

describe('useEnterSubmit', () => {
  describe('基本動作', () => {
    it('素の Enter で onSubmit が呼ばれる', () => {
      const onSubmit = jest.fn();
      const { result } = renderHook(() => useEnterSubmit(onSubmit));

      const event = createKeyboardEvent({ key: 'Enter' });
      result.current(event);

      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('Enter 以外のキー（例: "a"）では onSubmit が呼ばれない', () => {
      const onSubmit = jest.fn();
      const { result } = renderHook(() => useEnterSubmit(onSubmit));

      const event = createKeyboardEvent({ key: 'a', keyCode: 65 });
      result.current(event);

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('Space キーでは onSubmit が呼ばれない', () => {
      const onSubmit = jest.fn();
      const { result } = renderHook(() => useEnterSubmit(onSubmit));

      const event = createKeyboardEvent({ key: ' ', keyCode: 32 });
      result.current(event);

      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe('preventDefault の動作', () => {
    it('既定では event.preventDefault() が呼ばれる', () => {
      const onSubmit = jest.fn();
      const { result } = renderHook(() => useEnterSubmit(onSubmit));

      const event = createKeyboardEvent({ key: 'Enter' });
      result.current(event);

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
    });

    it('preventDefault: true の場合 event.preventDefault() が呼ばれる', () => {
      const onSubmit = jest.fn();
      const options: UseEnterSubmitOptions = { preventDefault: true };
      const { result } = renderHook(() => useEnterSubmit(onSubmit, options));

      const event = createKeyboardEvent({ key: 'Enter' });
      result.current(event);

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
    });

    it('preventDefault: false の場合 event.preventDefault() が呼ばれない', () => {
      const onSubmit = jest.fn();
      const options: UseEnterSubmitOptions = { preventDefault: false };
      const { result } = renderHook(() => useEnterSubmit(onSubmit, options));

      const event = createKeyboardEvent({ key: 'Enter' });
      result.current(event);

      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });

  describe('IME 変換確定の誤発火防止', () => {
    it('isComposing: true の Enter では onSubmit が呼ばれない', () => {
      const onSubmit = jest.fn();
      const { result } = renderHook(() => useEnterSubmit(onSubmit));

      const event = createKeyboardEvent({ key: 'Enter', isComposing: true });
      result.current(event);

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('isComposing: true の場合 event.preventDefault() も呼ばれない', () => {
      const onSubmit = jest.fn();
      const { result } = renderHook(() => useEnterSubmit(onSubmit));

      const event = createKeyboardEvent({ key: 'Enter', isComposing: true });
      result.current(event);

      expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('keyCode === 229 の Enter では onSubmit が呼ばれない（後方互換 IME 検出）', () => {
      const onSubmit = jest.fn();
      const { result } = renderHook(() => useEnterSubmit(onSubmit));

      const event = createKeyboardEvent({ key: 'Enter', keyCode: 229 });
      result.current(event);

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('keyCode === 229 かつ isComposing: false でも onSubmit が呼ばれない', () => {
      const onSubmit = jest.fn();
      const { result } = renderHook(() => useEnterSubmit(onSubmit));

      const event = createKeyboardEvent({ key: 'Enter', keyCode: 229, isComposing: false });
      result.current(event);

      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe('修飾キー付きの Enter', () => {
    it('Shift+Enter では onSubmit が呼ばれない', () => {
      const onSubmit = jest.fn();
      const { result } = renderHook(() => useEnterSubmit(onSubmit));

      const event = createKeyboardEvent({ key: 'Enter', shiftKey: true });
      result.current(event);

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('Ctrl+Enter では onSubmit が呼ばれない', () => {
      const onSubmit = jest.fn();
      const { result } = renderHook(() => useEnterSubmit(onSubmit));

      const event = createKeyboardEvent({ key: 'Enter', ctrlKey: true });
      result.current(event);

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('Meta+Enter では onSubmit が呼ばれない', () => {
      const onSubmit = jest.fn();
      const { result } = renderHook(() => useEnterSubmit(onSubmit));

      const event = createKeyboardEvent({ key: 'Enter', metaKey: true });
      result.current(event);

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('Alt+Enter では onSubmit が呼ばれない', () => {
      const onSubmit = jest.fn();
      const { result } = renderHook(() => useEnterSubmit(onSubmit));

      const event = createKeyboardEvent({ key: 'Enter', altKey: true });
      result.current(event);

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('修飾キー付きの場合 event.preventDefault() も呼ばれない', () => {
      const onSubmit = jest.fn();
      const { result } = renderHook(() => useEnterSubmit(onSubmit));

      const event = createKeyboardEvent({ key: 'Enter', shiftKey: true });
      result.current(event);

      expect(event.preventDefault).not.toHaveBeenCalled();
    });
  });

  describe('disabled オプション', () => {
    it('disabled: true のときは onSubmit が呼ばれない', () => {
      const onSubmit = jest.fn();
      const options: UseEnterSubmitOptions = { disabled: true };
      const { result } = renderHook(() => useEnterSubmit(onSubmit, options));

      const event = createKeyboardEvent({ key: 'Enter' });
      result.current(event);

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('disabled: true のときは event.preventDefault() も呼ばれない', () => {
      const onSubmit = jest.fn();
      const options: UseEnterSubmitOptions = { disabled: true };
      const { result } = renderHook(() => useEnterSubmit(onSubmit, options));

      const event = createKeyboardEvent({ key: 'Enter' });
      result.current(event);

      expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('disabled: false のときは onSubmit が呼ばれる', () => {
      const onSubmit = jest.fn();
      const options: UseEnterSubmitOptions = { disabled: false };
      const { result } = renderHook(() => useEnterSubmit(onSubmit, options));

      const event = createKeyboardEvent({ key: 'Enter' });
      result.current(event);

      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('disabled が未指定（既定 false）のときは onSubmit が呼ばれる', () => {
      const onSubmit = jest.fn();
      const { result } = renderHook(() => useEnterSubmit(onSubmit, {}));

      const event = createKeyboardEvent({ key: 'Enter' });
      result.current(event);

      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });

  describe('ハンドラの参照安定性', () => {
    it('依存が変わらなければ再レンダー間でハンドラが同一参照を返す', () => {
      const onSubmit = jest.fn();
      const { result, rerender } = renderHook(() => useEnterSubmit(onSubmit));

      const handlerBefore = result.current;
      rerender();
      const handlerAfter = result.current;

      expect(handlerBefore).toBe(handlerAfter);
    });

    it('onSubmit が変わるとハンドラの参照が変わる', () => {
      const onSubmit1 = jest.fn();
      const onSubmit2 = jest.fn();

      const { result, rerender } = renderHook(
        ({ onSubmit }: { onSubmit: () => void }) => useEnterSubmit(onSubmit),
        { initialProps: { onSubmit: onSubmit1 } }
      );

      const handlerBefore = result.current;
      rerender({ onSubmit: onSubmit2 });
      const handlerAfter = result.current;

      expect(handlerBefore).not.toBe(handlerAfter);
    });

    it('disabled が変わるとハンドラの参照が変わる', () => {
      const onSubmit = jest.fn();

      const { result, rerender } = renderHook(
        ({ disabled }: { disabled: boolean }) => useEnterSubmit(onSubmit, { disabled }),
        { initialProps: { disabled: false } }
      );

      const handlerBefore = result.current;
      rerender({ disabled: true });
      const handlerAfter = result.current;

      expect(handlerBefore).not.toBe(handlerAfter);
    });

    it('preventDefault が変わるとハンドラの参照が変わる', () => {
      const onSubmit = jest.fn();

      const { result, rerender } = renderHook(
        ({ preventDefault }: { preventDefault: boolean }) =>
          useEnterSubmit(onSubmit, { preventDefault }),
        { initialProps: { preventDefault: true } }
      );

      const handlerBefore = result.current;
      rerender({ preventDefault: false });
      const handlerAfter = result.current;

      expect(handlerBefore).not.toBe(handlerAfter);
    });
  });

  describe('オプション未指定時の既定値', () => {
    it('options が undefined でも動作する', () => {
      const onSubmit = jest.fn();
      const { result } = renderHook(() => useEnterSubmit(onSubmit, undefined));

      const event = createKeyboardEvent({ key: 'Enter' });
      result.current(event);

      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
    });

    it('options が空オブジェクトでも既定値で動作する', () => {
      const onSubmit = jest.fn();
      const { result } = renderHook(() => useEnterSubmit(onSubmit, {}));

      const event = createKeyboardEvent({ key: 'Enter' });
      result.current(event);

      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
    });
  });

  describe('ジェネリック型の動作', () => {
    it('HTMLTextAreaElement 型でもハンドラが正しく動作する', () => {
      const onSubmit = jest.fn();
      const { result } = renderHook(() => useEnterSubmit<HTMLTextAreaElement>(onSubmit));

      const event = createKeyboardEvent({
        key: 'Enter',
      }) as unknown as React.KeyboardEvent<HTMLTextAreaElement>;
      result.current(event);

      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });
});
