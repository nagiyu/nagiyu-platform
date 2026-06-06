'use client';

import React, { createContext, useContext, useState } from 'react';
import { DEFAULT_CLIENT_CHARACTER_ID, hasCharacterProfile } from './client-profiles';

/**
 * CharacterContext 関連のエラーメッセージ定数。
 */
export const CHARACTER_CONTEXT_ERROR_MESSAGES = {
  OUTSIDE_PROVIDER: 'useCharacter は CharacterProvider の配下でのみ使用できます。',
} as const;

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
 */
export function CharacterProvider({ children }: { children: React.ReactNode }) {
  const [characterId, setCharacterIdState] = useState<string>(DEFAULT_CLIENT_CHARACTER_ID);

  const setCharacterId = (id: string) => {
    // 未登録の id は無視する（状態を変えない）
    if (!hasCharacterProfile(id)) return;
    setCharacterIdState(id);
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
