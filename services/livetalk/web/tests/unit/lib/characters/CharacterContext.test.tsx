/**
 * CharacterContext のユニットテスト。
 */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CharacterProvider, useCharacter, CHARACTER_CONTEXT_ERROR_MESSAGES } from '@/lib/characters/CharacterContext';
import { DEFAULT_CLIENT_CHARACTER_ID } from '@/lib/characters/client-profiles';

/** useCharacter の結果を描画するテスト用コンポーネント */
function TestConsumer() {
  const { characterId, setCharacterId } = useCharacter();
  return (
    <div>
      <span data-testid="character-id">{characterId}</span>
      <button onClick={() => setCharacterId('hiyori')}>hiyoriにする</button>
      <button onClick={() => setCharacterId('unknown_id')}>未登録にする</button>
    </div>
  );
}

/** Provider 外で useCharacter を呼ぶコンポーネント */
function OutsideConsumer() {
  useCharacter();
  return null;
}

describe('CharacterProvider と useCharacter', () => {
  describe('初期値', () => {
    it('既定の characterId は DEFAULT_CLIENT_CHARACTER_ID である', () => {
      render(
        <CharacterProvider>
          <TestConsumer />
        </CharacterProvider>
      );
      expect(screen.getByTestId('character-id').textContent).toBe(DEFAULT_CLIENT_CHARACTER_ID);
    });
  });

  describe('setCharacterId', () => {
    it('登録済みの id を渡すと characterId が更新される', async () => {
      const user = userEvent.setup();
      render(
        <CharacterProvider>
          <TestConsumer />
        </CharacterProvider>
      );
      await user.click(screen.getByRole('button', { name: 'hiyoriにする' }));
      expect(screen.getByTestId('character-id').textContent).toBe('hiyori');
    });

    it('未登録の id を渡しても characterId が変わらない（無視される）', async () => {
      const user = userEvent.setup();
      render(
        <CharacterProvider>
          <TestConsumer />
        </CharacterProvider>
      );
      const before = screen.getByTestId('character-id').textContent;
      await user.click(screen.getByRole('button', { name: '未登録にする' }));
      // 状態が変わっていないことを確認
      expect(screen.getByTestId('character-id').textContent).toBe(before);
    });
  });

  describe('Provider 外での使用', () => {
    it('Provider の外で useCharacter を呼ぶと日本語エラーをスローする', () => {
      // エラーによる React のコンソールエラーを抑制
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => render(<OutsideConsumer />)).toThrow(
        CHARACTER_CONTEXT_ERROR_MESSAGES.OUTSIDE_PROVIDER
      );

      consoleSpy.mockRestore();
    });

    it('エラーメッセージ定数は日本語を含む', () => {
      expect(CHARACTER_CONTEXT_ERROR_MESSAGES.OUTSIDE_PROVIDER).toMatch(/[ぁ-ん]/);
    });
  });
});
