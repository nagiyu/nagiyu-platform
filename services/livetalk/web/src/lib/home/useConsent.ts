'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ConsentPhase } from './types';

/**
 * useConsent の戻り値型。
 */
export interface UseConsentResult {
  /** 現在の同意フェーズ */
  consentPhase: ConsentPhase;
  /** 同意済みにマークする（ConsentModal の onConsented に渡す）。 */
  markConsented: () => void;
}

/**
 * 同意状態を管理するカスタム hook。
 *
 * マウント時に /api/consent を取得し、同意済みかどうかを判定する。
 * 取得失敗時はモーダルを表示してユーザーに同意を促す。
 */
export function useConsent(): UseConsentResult {
  const [consentPhase, setConsentPhase] = useState<ConsentPhase>('checking');

  useEffect(() => {
    fetch('/api/consent')
      .then((res) => res.json())
      .then((data: { consented: boolean }) => {
        setConsentPhase(data.consented ? 'done' : 'required');
      })
      .catch(() => {
        // 取得失敗時はモーダルを表示してユーザーに同意を促す
        setConsentPhase('required');
      });
  }, []);

  const markConsented = useCallback(() => {
    setConsentPhase('done');
  }, []);

  return { consentPhase, markConsented };
}
