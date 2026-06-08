import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import MemoryPage from '@/app/memory/page';
import { fetchMemories, deleteMemory, pinMemory } from '@/lib/memory/api-client';
import { useCharacter } from '@/lib/characters/CharacterContext';

// api-client をモック
jest.mock('@/lib/memory/api-client', () => ({
  fetchMemories: jest.fn(),
  deleteMemory: jest.fn(),
  pinMemory: jest.fn(),
}));

// useCharacter をモック（省略時は hiyori を返す）
jest.mock('@/lib/characters/CharacterContext', () => ({
  useCharacter: jest.fn(() => ({
    characterId: 'hiyori',
    setCharacterId: jest.fn(),
  })),
}));

// MemoryTierTabs・MemoryList・MemoryDeleteDialog は DOM 描画確認に不要なためモック
jest.mock('@/components/MemoryTierTabs', () => ({
  __esModule: true,
  default: jest.fn(({ onChange }: { value: string; onChange: (v: string) => void }) => (
    <button data-testid="tier-tab-b" onClick={() => onChange('B')}>
      B
    </button>
  )),
}));

jest.mock('@/components/MemoryList', () => ({
  __esModule: true,
  default: jest.fn(({ loading }: { memories: unknown[]; loading: boolean }) => (
    <div data-testid="memory-list">{loading ? 'loading' : 'loaded'}</div>
  )),
}));

jest.mock('@/components/MemoryDeleteDialog', () => ({
  __esModule: true,
  default: jest.fn(() => null),
}));

// messages のモジュールは getCharacterDisplay を呼ぶため client-profiles 経由でモック
jest.mock('@/lib/memory/messages', () => ({
  MEMORY_PAGE_GUIDANCE: 'テストガイダンス',
}));

const mockFetchMemories = fetchMemories as jest.MockedFunction<typeof fetchMemories>;
const mockDeleteMemory = deleteMemory as jest.MockedFunction<typeof deleteMemory>;
const mockPinMemory = pinMemory as jest.MockedFunction<typeof pinMemory>;
const mockUseCharacter = useCharacter as jest.MockedFunction<typeof useCharacter>;

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchMemories.mockResolvedValue([]);
  mockDeleteMemory.mockResolvedValue(undefined);
  mockPinMemory.mockResolvedValue({ id: 'x', tier: 'A' } as never);
  mockUseCharacter.mockReturnValue({ characterId: 'hiyori', setCharacterId: jest.fn() });
});

describe('MemoryPage（characterId 連携）', () => {
  it('マウント時に useCharacter の characterId を fetchMemories に渡す', async () => {
    mockUseCharacter.mockReturnValue({ characterId: 'hiyori', setCharacterId: jest.fn() });
    render(<MemoryPage />);

    await waitFor(() => {
      expect(mockFetchMemories).toHaveBeenCalledWith('A', 'hiyori');
    });
  });

  it('useCharacter が ageha を返す場合、fetchMemories に ageha を渡す', async () => {
    mockUseCharacter.mockReturnValue({ characterId: 'ageha', setCharacterId: jest.fn() });
    render(<MemoryPage />);

    await waitFor(() => {
      expect(mockFetchMemories).toHaveBeenCalledWith('A', 'ageha');
    });
  });

  it('ローディング中に "loading" が表示される', () => {
    // resolve しないことでローディング状態を維持
    mockFetchMemories.mockReturnValue(new Promise(() => {}));
    render(<MemoryPage />);
    expect(screen.getByTestId('memory-list')).toHaveTextContent('loading');
  });

  it('取得完了後に "loaded" が表示される', async () => {
    render(<MemoryPage />);
    await waitFor(() => {
      expect(screen.getByTestId('memory-list')).toHaveTextContent('loaded');
    });
  });

  it('fetchMemories が失敗するとエラーメッセージが表示される', async () => {
    mockFetchMemories.mockRejectedValueOnce(new Error('記憶の取得に失敗しました'));
    render(<MemoryPage />);

    await waitFor(() => {
      // MuiAlert と エラー Typography の両方が role=alert を持つため、AllByRole で検索する
      const alerts = screen.getAllByRole('alert');
      const errorAlert = alerts.find((el) => el.textContent === '記憶の取得に失敗しました');
      expect(errorAlert).toBeTruthy();
    });
  });
});
