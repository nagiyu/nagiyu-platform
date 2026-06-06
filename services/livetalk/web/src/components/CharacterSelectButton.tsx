'use client';

import { useState } from 'react';
import { Button } from '@nagiyu/ui';
import { useCharacter } from '@/lib/characters/CharacterContext';
import { getCharacterDisplay } from '@/lib/characters/client-profiles';
import CharacterSelectModal from '@/components/CharacterSelectModal';

export interface CharacterSelectButtonProps {
  /**
   * 再生中・応答中など、キャラクター切替を無効化したい状態。
   */
  disabled?: boolean;
}

/**
 * キャラクター選択モーダルを開くトリガーボタン。
 * 現在選択中のキャラクター名をボタンラベルに表示する。
 */
export default function CharacterSelectButton({ disabled }: CharacterSelectButtonProps) {
  const { characterId } = useCharacter();
  const [modalOpen, setModalOpen] = useState(false);

  const displayName = getCharacterDisplay(characterId).displayName;

  return (
    <>
      <Button
        variant="outline"
        color="primary"
        size="sm"
        onClick={() => setModalOpen(true)}
        disabled={disabled}
      >
        キャラ：{displayName}
      </Button>
      <CharacterSelectModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
