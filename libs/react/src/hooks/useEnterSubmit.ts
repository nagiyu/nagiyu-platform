/**
 * useEnterSubmit Hook
 *
 * 単一行入力でエンターキー押下時に onSubmit を呼ぶ onKeyDown ハンドラを生成するカスタムフック。
 * IME 変換確定中の Enter による誤発火を防ぐ。
 *
 * @example
 * ```tsx
 * import { useEnterSubmit } from '@nagiyu/react';
 *
 * function SearchInput() {
 *   const [value, setValue] = React.useState('');
 *
 *   const handleKeyDown = useEnterSubmit(() => {
 *     console.log('検索実行:', value);
 *   });
 *
 *   return (
 *     <input
 *       value={value}
 *       onChange={(e) => setValue(e.target.value)}
 *       onKeyDown={handleKeyDown}
 *     />
 *   );
 * }
 * ```
 */

import { useCallback } from 'react';
import type React from 'react';

/**
 * useEnterSubmit のオプション
 */
export interface UseEnterSubmitOptions {
  /**
   * true の間はエンター確定を無効化する。
   * 既定: false
   */
  disabled?: boolean;

  /**
   * エンター確定時に event.preventDefault() を呼ぶか。
   * 既定: true
   */
  preventDefault?: boolean;
}

/**
 * useEnterSubmit Hook
 *
 * 単一行入力でエンターキー押下時に onSubmit を呼ぶ onKeyDown ハンドラを生成する。
 * IME 変換確定中の Enter を無視し、修飾キー付きの Enter も無視する。
 *
 * @template T - イベントターゲットの HTML 要素型（既定: HTMLInputElement）
 * @param onSubmit - エンターキー確定時に呼ばれるコールバック
 * @param options - Hook のオプション
 * @returns onKeyDown に渡すイベントハンドラ
 */
export function useEnterSubmit<T extends HTMLElement = HTMLInputElement>(
  onSubmit: () => void,
  options?: UseEnterSubmitOptions
): (event: React.KeyboardEvent<T>) => void {
  const disabled = options?.disabled ?? false;
  const preventDefault = options?.preventDefault ?? true;

  return useCallback(
    (event: React.KeyboardEvent<T>) => {
      // Enter キー以外は無視
      if (event.key !== 'Enter') {
        return;
      }

      // IME 変換確定中の Enter は無視する（誤確定防止）
      // isComposing: 標準的な IME 確定検出
      // keyCode === 229: 一部ブラウザ・環境での IME 確定検出（後方互換）
      if (event.nativeEvent.isComposing || event.keyCode === 229) {
        return;
      }

      // 修飾キー付きの Enter は無視する（改行・ショートカット等を壊さないため）
      if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      // disabled の場合は何もしない
      if (disabled) {
        return;
      }

      // 確定条件を満たした場合の処理
      if (preventDefault) {
        event.preventDefault();
      }

      onSubmit();
    },
    [onSubmit, disabled, preventDefault]
  );
}
