/**
 * CharacterSelector コンポーネントのユニットテスト。
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import CharacterSelector from '@/components/CharacterSelector';
import { CharacterProvider } from '@/lib/characters/CharacterContext';
import { getRegisteredProfileIds, getCharacterDisplay } from '@/lib/characters/client-profiles';

/** CharacterProvider でラップしたレンダリングヘルパー */
function renderWithProvider(disabled?: boolean) {
  return render(
    <CharacterProvider>
      <CharacterSelector disabled={disabled} />
    </CharacterProvider>
  );
}

describe('CharacterSelector', () => {
  describe('登録済みキャラクターの表示', () => {
    it('現在の characterId が Select の value として選択されている', () => {
      renderWithProvider();
      const firstId = getRegisteredProfileIds()[0];
      const display = getCharacterDisplay(firstId);
      expect(screen.getByText(display.displayName)).toBeInTheDocument();
      expect(screen.getByRole('combobox')).toHaveValue(firstId);
    });

    it('aria-label が付いている（アクセシビリティ）', () => {
      renderWithProvider();
      expect(screen.getByRole('combobox')).toHaveAttribute('aria-label', 'キャラクター選択');
    });
  });

  describe('disabled prop', () => {
    it('disabled=true のとき Select が無効化される', () => {
      renderWithProvider(true);
      expect(screen.getByRole('combobox')).toBeDisabled();
    });

    it('disabled=false のとき Select は有効', () => {
      renderWithProvider(false);
      expect(screen.getByRole('combobox')).not.toBeDisabled();
    });

    it('disabled 未指定のとき Select は有効', () => {
      renderWithProvider();
      expect(screen.getByRole('combobox')).not.toBeDisabled();
    });
  });

  describe('キャラクター選択', () => {
    it('現状はひより 1 件のみ登録されている（将来追加で増える）', () => {
      const ids = getRegisteredProfileIds();
      expect(ids).toHaveLength(1);
      expect(ids[0]).toBe('hiyori');
    });
  });
});
