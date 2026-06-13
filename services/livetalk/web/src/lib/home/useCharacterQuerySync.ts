'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useCharacter } from '../characters/CharacterContext';
import { hasCharacterProfile } from '../characters/client-profiles';

/**
 * URL クエリパラメータ ?character=<id> をカレントキャラクターに反映するカスタム hook。
 *
 * push クリック起動時: URL の ?character=<id> を読み、カレントキャラを切替える。
 * searchParams は Next.js の useSearchParams で取得。
 * 依存配列に searchParams を含めることで、SPA 遷移でも正しく動作する。
 *
 * 副作用のみで戻り値なし。
 */
export function useCharacterQuerySync(): void {
  const searchParams = useSearchParams();
  const { setCharacterId } = useCharacter();

  useEffect(() => {
    const characterQuery = searchParams.get('character');
    if (characterQuery && hasCharacterProfile(characterQuery)) {
      setCharacterId(characterQuery);
    }
    // searchParams の変化のみに依存する（setCharacterId は安定した関数参照）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
}
