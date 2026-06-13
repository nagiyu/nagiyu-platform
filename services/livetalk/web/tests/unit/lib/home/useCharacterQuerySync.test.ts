import { renderHook } from '@testing-library/react';
import { useCharacterQuerySync } from '@/lib/home/useCharacterQuerySync';

// useSearchParams をモック化
const mockSearchParamsGet = jest.fn().mockReturnValue(null);
jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(() => ({
    get: mockSearchParamsGet,
  })),
}));

// CharacterContext の useCharacter をモック化
const mockSetCharacterId = jest.fn();
jest.mock('@/lib/characters/CharacterContext', () => ({
  useCharacter: jest.fn(() => ({
    characterId: 'hiyori',
    setCharacterId: mockSetCharacterId,
  })),
}));

// hasCharacterProfile をモック化（hiyori と ageha は有効、other は無効）
jest.mock('@/lib/characters/client-profiles', () => ({
  hasCharacterProfile: jest.fn((id: string) => ['hiyori', 'ageha'].includes(id)),
}));

afterEach(() => {
  jest.clearAllMocks();
  mockSearchParamsGet.mockReturnValue(null);
});

describe('useCharacterQuerySync', () => {
  describe('?character クエリがない場合', () => {
    it('character クエリがないとき setCharacterId は呼ばれない', () => {
      mockSearchParamsGet.mockReturnValue(null);
      renderHook(() => useCharacterQuerySync());
      expect(mockSetCharacterId).not.toHaveBeenCalled();
    });
  });

  describe('有効な ?character クエリがある場合', () => {
    it('?character=ageha のとき setCharacterId(ageha) が呼ばれる', () => {
      mockSearchParamsGet.mockImplementation((key: string) => {
        if (key === 'character') return 'ageha';
        return null;
      });
      renderHook(() => useCharacterQuerySync());
      expect(mockSetCharacterId).toHaveBeenCalledWith('ageha');
    });

    it('?character=hiyori のとき setCharacterId(hiyori) が呼ばれる', () => {
      mockSearchParamsGet.mockImplementation((key: string) => {
        if (key === 'character') return 'hiyori';
        return null;
      });
      renderHook(() => useCharacterQuerySync());
      expect(mockSetCharacterId).toHaveBeenCalledWith('hiyori');
    });
  });

  describe('無効な ?character クエリがある場合', () => {
    it('登録されていないキャラクター ID のとき setCharacterId は呼ばれない', () => {
      mockSearchParamsGet.mockImplementation((key: string) => {
        if (key === 'character') return 'unknown-character-xyz';
        return null;
      });
      renderHook(() => useCharacterQuerySync());
      expect(mockSetCharacterId).not.toHaveBeenCalled();
    });

    it('空文字のとき setCharacterId は呼ばれない', () => {
      mockSearchParamsGet.mockImplementation((key: string) => {
        if (key === 'character') return '';
        return null;
      });
      renderHook(() => useCharacterQuerySync());
      expect(mockSetCharacterId).not.toHaveBeenCalled();
    });
  });

  describe('戻り値', () => {
    it('戻り値は void（undefined）', () => {
      mockSearchParamsGet.mockReturnValue(null);
      const { result } = renderHook(() => useCharacterQuerySync());
      expect(result.current).toBeUndefined();
    });
  });
});
