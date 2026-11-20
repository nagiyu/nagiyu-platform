'use client';

import { useCallback, useEffect, useState } from 'react';
import { buildConsentNotice, type ConsentNotice, type ConsentSnapshot } from '@/lib/consent/notice';
import type { ConsentPhase } from './types';

/**
 * useConsent の戻り値型。
 */
export interface UseConsentResult {
  /** 現在の同意フェーズ */
  consentPhase: ConsentPhase;
  /** 同意のダイアログに出す内容 (初回か改定か) */
  consentNotice: ConsentNotice;
  /** 同意済みにマークする（ConsentModal の onConsented に渡す）。 */
  markConsented: () => void;
  /**
   * 同意が要る状態へ戻す (サーバーが同意なしと判定したときにダイアログを開き直す)。
   * 最新の同意の状態を取り直してから開く。取得に失敗したら初回のダイアログを出す。
   */
  requireConsent: () => Promise<void>;
}

async function fetchConsent(): Promise<{ consented: boolean; notice: ConsentNotice }> {
  const res = await fetch('/api/consent');
  const data: { consented: boolean } & Partial<ConsentSnapshot> = await res.json();
  const snapshot =
    data.requiredVersions && data.current !== undefined
      ? { requiredVersions: data.requiredVersions, current: data.current }
      : null;
  return { consented: data.consented, notice: buildConsentNotice(snapshot) };
}

/**
 * 同意状態を管理するカスタム hook。
 *
 * マウント時に /api/consent を取得し、同意済みかどうかと、初回か改定かを判定する。
 * 取得失敗時は初回のモーダルを表示してユーザーに同意を促す。
 */
export function useConsent(): UseConsentResult {
  const [consentPhase, setConsentPhase] = useState<ConsentPhase>('checking');
  const [consentNotice, setConsentNotice] = useState<ConsentNotice>({ kind: 'initial' });

  useEffect(() => {
    fetchConsent()
      .then(({ consented, notice }) => {
        setConsentNotice(notice);
        setConsentPhase(consented ? 'done' : 'required');
      })
      .catch(() => {
        // 取得失敗時は初回のモーダルを表示してユーザーに同意を促す
        setConsentPhase('required');
      });
  }, []);

  const markConsented = useCallback(() => {
    setConsentPhase('done');
  }, []);

  const requireConsent = useCallback(async () => {
    // 改定の有無はサーバーの最新の記録で決める。画面を開いた後に版が上がることもある
    try {
      const { notice } = await fetchConsent();
      setConsentNotice(notice);
    } catch {
      setConsentNotice({ kind: 'initial' });
    }
    setConsentPhase('required');
  }, []);

  return { consentPhase, consentNotice, markConsented, requireConsent };
}
