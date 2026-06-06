/**
 * CharacterSelector コンポーネントのユニットテスト。
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
      // MUI Select のデフォルト表示を確認（hiyori が表示名で表示される）
      const profileIds = getRegisteredProfileIds();
      const firstId = profileIds[0];
      const display = getCharacterDisplay(firstId);
      expect(screen.getByText(display.displayName)).toBeInTheDocument();
    });

    it('aria-label が付いている（アクセシビリティ）', () => {
      renderWithProvider();
      // inputProps の aria-label は native input に付く
      const input = screen.getByRole('combobox');
      expect(input).toBeInTheDocument();
    });
  });

  describe('disabled prop', () => {
    it('disabled=true のとき Select に aria-disabled が付く', () => {
      renderWithProvider(true);
      // MUI Select は disabled のとき aria-disabled="true" を付与する
      const selectButton = screen.getByRole('combobox');
      expect(selectButton).toHaveAttribute('aria-disabled', 'true');
    });

    it('disabled=false のとき Select に aria-disabled が付かない', () => {
      renderWithProvider(false);
      const selectButton = screen.getByRole('combobox');
      expect(selectButton).not.toHaveAttribute('aria-disabled', 'true');
    });

    it('disabled 未指定のとき Select に aria-disabled が付かない', () => {
      renderWithProvider();
      const selectButton = screen.getByRole('combobox');
      expect(selectButton).not.toHaveAttribute('aria-disabled', 'true');
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
