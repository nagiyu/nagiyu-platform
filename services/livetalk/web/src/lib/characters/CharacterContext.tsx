'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { DEFAULT_CLIENT_CHARACTER_ID, hasCharacterProfile } from './client-profiles';

/**
 * CharacterContext 関連のエラーメッセージ定数。
 */
export const CHARACTER_CONTEXT_ERROR_MESSAGES = {
  OUTSIDE_PROVIDER: 'useCharacter は CharacterProvider の配下でのみ使用できます。',
} as const;

/**
 * localStorage に選択キャラクター ID を保存するキー定数。
 */
export const CHARACTER_STORAGE_KEY = 'livetalk:selectedCharacterId';

/**
 * キャラクター選択状態のコンテキスト型。
 */
interface CharacterContextValue {
  /** 現在選択中のキャラクター ID */
  characterId: string;
  /**
   * キャラクター ID を更新する。
   * 未登録の id を渡した場合は状態を変更しない（無視する）。
   */
  setCharacterId: (id: string) => void;
}

const CharacterContext = createContext<CharacterContextValue | null>(null);

/**
 * キャラクター選択状態を提供する Provider。
 * アプリ全体をラップして useCharacter() フックを使えるようにする。
 *
 * - 初期値は DEFAULT_CLIENT_CHARACTER_ID（SSR・初回クライアント描画を一致させ
 *   ハイドレーション不一致を避けるため、useState 初期化子では localStorage を読まない）。
 * - マウント後に useEffect で localStorage から保存値を復元する。
 * - setCharacterId で有効な id を選択すると localStorage に保存する。
 */
export function CharacterProvider({ children }: { children: React.ReactNode }) {
  const [characterId, setCharacterIdState] = useState<string>(DEFAULT_CLIENT_CHARACTER_ID);

  // マウント後（クライアントのみ）に localStorage から保存値を復元する。
  // SSR 時は window が存在しないため typeof window ガードで保護する。
  // プライベートモード等で localStorage へのアクセスが例外になっても落ちないよう try/catch する。
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(CHARACTER_STORAGE_KEY);
      if (stored !== null && hasCharacterProfile(stored)) {
        setCharacterIdState(stored);
      }
    } catch {
      // localStorage アクセスが拒否された場合は既定値のまま継続する
    }
  }, []);

  const setCharacterId = (id: string) => {
    // 未登録の id は無視する（状態を変えない）
    if (!hasCharacterProfile(id)) return;
    setCharacterIdState(id);
    // 選択した id を localStorage に保存する（SSR 環境・例外時はスキップ）
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(CHARACTER_STORAGE_KEY, id);
    } catch {
      // localStorage への書き込みが拒否された場合はサイレントに無視する
    }
  };

  return (
    <CharacterContext.Provider value={{ characterId, setCharacterId }}>
      {children}
    </CharacterContext.Provider>
  );
}

/**
 * 現在選択中のキャラクター ID と更新関数を返すフック。
 * CharacterProvider の配下でのみ使用可能。
 */
export function useCharacter(): CharacterContextValue {
  const ctx = useContext(CharacterContext);
  if (!ctx) {
    throw new Error(CHARACTER_CONTEXT_ERROR_MESSAGES.OUTSIDE_PROVIDER);
  }
  return ctx;
}
