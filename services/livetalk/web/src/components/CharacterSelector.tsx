'use client';

import { FormControl, InputLabel, MenuItem, Select } from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import { useCharacter } from '@/lib/characters/CharacterContext';
import { getCharacterDisplay, getRegisteredProfileIds } from '@/lib/characters/client-profiles';

export interface CharacterSelectorProps {
  /**
   * 再生中・応答中など、キャラクター切替を無効化したい状態。
   */
  disabled?: boolean;
}

/**
 * 登録済みキャラクターを MUI Select で一覧表示し、選択を切り替えるコンポーネント。
 * 現状はひより 1 件のみ表示される（将来キャラが追加されると自動的に増える）。
 */
export default function CharacterSelector({ disabled }: CharacterSelectorProps) {
  const { characterId, setCharacterId } = useCharacter();
  const profileIds = getRegisteredProfileIds();

  const handleChange = (event: SelectChangeEvent<string>) => {
    setCharacterId(event.target.value);
  };

  return (
    <FormControl size="small" sx={{ minWidth: 140 }}>
      <InputLabel id="character-selector-label">キャラクター</InputLabel>
      <Select
        labelId="character-selector-label"
        id="character-selector"
        value={characterId}
        label="キャラクター"
        onChange={handleChange}
        disabled={disabled}
        inputProps={{ 'aria-label': 'キャラクター選択' }}
      >
        {profileIds.map((id) => {
          const display = getCharacterDisplay(id);
          return (
            <MenuItem key={id} value={id}>
              {display.displayName}
            </MenuItem>
          );
        })}
      </Select>
    </FormControl>
  );
}
