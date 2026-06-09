/**
 * CharacterContext のユニットテスト。
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CharacterProvider,
  useCharacter,
  CHARACTER_CONTEXT_ERROR_MESSAGES,
  CHARACTER_STORAGE_KEY,
} from '@/lib/characters/CharacterContext';
import { DEFAULT_CLIENT_CHARACTER_ID } from '@/lib/characters/client-profiles';

/** useCharacter の結果を描画するテスト用コンポーネント */
function TestConsumer() {
  const { characterId, setCharacterId } = useCharacter();
  return (
    <div>
      <span data-testid="character-id">{characterId}</span>
      <button onClick={() => setCharacterId('hiyori')}>hiyoriにする</button>
      <button onClick={() => setCharacterId('ageha')}>agehaにする</button>
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
  // 各テストの前に localStorage をクリアしてテスト間の干渉を防ぐ
  beforeEach(() => {
    localStorage.clear();
  });

  describe('初期値', () => {
    it('既定の characterId は DEFAULT_CLIENT_CHARACTER_ID である', async () => {
      render(
        <CharacterProvider>
          <TestConsumer />
        </CharacterProvider>
      );
      // useEffect による復元後も localStorage が空なら既定値のまま
      await waitFor(() => {
        expect(screen.getByTestId('character-id').textContent).toBe(DEFAULT_CLIENT_CHARACTER_ID);
      });
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
      await waitFor(() => {
        expect(screen.getByTestId('character-id').textContent).toBe(DEFAULT_CLIENT_CHARACTER_ID);
      });
      const before = screen.getByTestId('character-id').textContent;
      await user.click(screen.getByRole('button', { name: '未登録にする' }));
      // 状態が変わっていないことを確認
      expect(screen.getByTestId('character-id').textContent).toBe(before);
    });
  });

  describe('localStorage への保存', () => {
    it('setCharacterId で有効な id を指定すると localStorage に保存される', async () => {
      const user = userEvent.setup();
      render(
        <CharacterProvider>
          <TestConsumer />
        </CharacterProvider>
      );
      await user.click(screen.getByRole('button', { name: 'agehaにする' }));
      expect(localStorage.getItem(CHARACTER_STORAGE_KEY)).toBe('ageha');
    });

    it('未登録の id を setCharacterId に渡しても localStorage に保存されない', async () => {
      const user = userEvent.setup();
      render(
        <CharacterProvider>
          <TestConsumer />
        </CharacterProvider>
      );
      await user.click(screen.getByRole('button', { name: '未登録にする' }));
      expect(localStorage.getItem(CHARACTER_STORAGE_KEY)).toBeNull();
    });
  });

  describe('localStorage からの復元', () => {
    it('有効な id が localStorage に保存されている場合、マウント時に復元される', async () => {
      // 事前に有効な id を localStorage に設定
      localStorage.setItem(CHARACTER_STORAGE_KEY, 'ageha');
      render(
        <CharacterProvider>
          <TestConsumer />
        </CharacterProvider>
      );
      // useEffect による非同期復元を待つ
      await waitFor(() => {
        expect(screen.getByTestId('character-id').textContent).toBe('ageha');
      });
    });

    it('localStorage に無効・未登録の id が入っている場合は既定値にフォールバックする', async () => {
      localStorage.setItem(CHARACTER_STORAGE_KEY, 'invalid_character_id');
      render(
        <CharacterProvider>
          <TestConsumer />
        </CharacterProvider>
      );
      await waitFor(() => {
        expect(screen.getByTestId('character-id').textContent).toBe(DEFAULT_CLIENT_CHARACTER_ID);
      });
    });

    it('localStorage の値が null（未設定）の場合は既定値のまま', async () => {
      // localStorage には何も設定しない
      render(
        <CharacterProvider>
          <TestConsumer />
        </CharacterProvider>
      );
      await waitFor(() => {
        expect(screen.getByTestId('character-id').textContent).toBe(DEFAULT_CLIENT_CHARACTER_ID);
      });
    });
  });

  describe('localStorage アクセスエラー時の安全動作', () => {
    it('localStorage.getItem が例外をスローしても既定値で動作を継続する', async () => {
      const getItemSpy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('localStorage へのアクセスが拒否されました');
      });

      render(
        <CharacterProvider>
          <TestConsumer />
        </CharacterProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('character-id').textContent).toBe(DEFAULT_CLIENT_CHARACTER_ID);
      });

      getItemSpy.mockRestore();
    });

    it('localStorage.setItem が例外をスローしても状態更新は正常に行われる', async () => {
      const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('localStorage への書き込みが拒否されました');
      });
      const user = userEvent.setup();

      render(
        <CharacterProvider>
          <TestConsumer />
        </CharacterProvider>
      );

      // 例外が発生しても状態更新は正常に完了する
      await user.click(screen.getByRole('button', { name: 'agehaにする' }));
      expect(screen.getByTestId('character-id').textContent).toBe('ageha');

      setItemSpy.mockRestore();
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

  describe('CHARACTER_STORAGE_KEY 定数', () => {
    it('CHARACTER_STORAGE_KEY が定義されている', () => {
      expect(CHARACTER_STORAGE_KEY).toBe('livetalk:selectedCharacterId');
    });
  });
});
