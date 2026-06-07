'use client';

import { useCharacter } from '@/lib/characters/CharacterContext';
import { getCharacterLicenseText } from '@/lib/characters/client-profiles';

/**
 * 現在選択中のキャラクターのライセンス・クレジット文字列を表示するコンポーネント。
 * フッターの licenseText に渡すことで、キャラクター切替に連動してクレジット表示が更新される。
 * Live2D Free Material License / VOICEVOX クレジットの常時表示要件を維持する。
 */
export default function CharacterLicenseText() {
  const { characterId } = useCharacter();
  return <>{getCharacterLicenseText(characterId)}</>;
}
