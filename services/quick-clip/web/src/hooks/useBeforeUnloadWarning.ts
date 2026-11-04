import { useEffect } from 'react';

/**
 * 有効な間だけ、タブを閉じる・再読み込み・ページ全体の遷移をブラウザの確認で止めるフック
 *
 * 確認文言はブラウザ固定で変更できない。クライアント遷移（router.push）は
 * beforeunload を発火しないため対象外で、画面を離れたときのアンマウントで解除される。
 *
 * @param enabled - true の間だけ警告を有効にする
 */
export function useBeforeUnloadWarning(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // preventDefault を解釈しない古いブラウザ向け
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [enabled]);
}
