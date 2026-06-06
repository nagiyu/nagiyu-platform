'use client';

import { Select } from '@nagiyu/ui';
import type { SelectOption } from '@nagiyu/ui';
import { useCharacter } from '@/lib/characters/CharacterContext';
import { getCharacterDisplay, getRegisteredProfileIds } from '@/lib/characters/client-profiles';

export interface CharacterSelectorProps {
  /**
   * 再生中・応答中など、キャラクター切替を無効化したい状態。
   */
  disabled?: boolean;
}

/**
 * 登録済みキャラクターを @nagiyu/ui の Select で一覧表示し、選択を切り替えるコンポーネント。
 * 現状はひより 1 件のみ表示される（将来キャラが追加されると自動的に増える）。
 */
export default function CharacterSelector({ disabled }: CharacterSelectorProps) {
  const { characterId, setCharacterId } = useCharacter();
  const options: SelectOption[] = getRegisteredProfileIds().map((id) => ({
    value: id,
    label: getCharacterDisplay(id).displayName,
  }));

  return (
    <Select
      size="sm"
      label="キャラクター"
      aria-label="キャラクター選択"
      value={characterId}
      onChange={setCharacterId}
      options={options}
      disabled={disabled}
    />
  );
}
