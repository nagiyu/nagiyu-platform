'use client';

import { useRouter } from 'next/navigation';
import { Select } from '@nagiyu/ui';
import { getRegisteredProfileIds, getCharacterDisplay } from '@/lib/characters/client-profiles';

export interface StatusCharacterSwitcherProps {
  /** 現在表示中のキャラクター ID */
  currentCharacterId: string;
}

/**
 * ステータスページ（admin デバッグ用）のキャラクター切替 UI。
 *
 * 登録済みキャラクターを列挙し、選択変更時に
 * `/status?characterId=<id>` へ遷移する。
 */
export default function StatusCharacterSwitcher({
  currentCharacterId,
}: StatusCharacterSwitcherProps) {
  const router = useRouter();

  const options = getRegisteredProfileIds().map((id) => ({
    value: id,
    label: getCharacterDisplay(id).displayName,
  }));

  const handleChange = (value: string) => {
    router.push(`/status?characterId=${encodeURIComponent(value)}`);
  };

  return (
    <Select
      label="表示キャラクター"
      value={currentCharacterId}
      onChange={handleChange}
      options={options}
    />
  );
}
