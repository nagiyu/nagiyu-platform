import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import MemoryPage from '@/app/memory/page';
import { fetchSelfFacts, deleteSelfFact } from '@/lib/memory/api-client';
import { useCharacter } from '@/lib/characters/CharacterContext';
import MemoryList from '@/components/MemoryList';

// api-client をモック
jest.mock('@/lib/memory/api-client', () => ({
  fetchSelfFacts: jest.fn(),
  deleteSelfFact: jest.fn(),
}));

// useCharacter をモック（省略時は hiyori を返す）
jest.mock('@/lib/characters/CharacterContext', () => ({
  useCharacter: jest.fn(() => ({
    characterId: 'hiyori',
    setCharacterId: jest.fn(),
  })),
}));

// MemoryList・MemoryDeleteDialog は DOM 描画確認に不要なためモック
jest.mock('@/components/MemoryList', () => ({
  __esModule: true,
  default: jest.fn(({ loading }: { items: unknown[]; loading: boolean }) => (
    <div data-testid="memory-list">{loading ? 'loading' : 'loaded'}</div>
  )),
}));

jest.mock('@/components/MemoryDeleteDialog', () => ({
  __esModule: true,
  default: jest.fn(() => null),
}));

// messages のモジュールは getCharacterDisplay を呼ぶため関数ごとモック
jest.mock('@/lib/memory/messages', () => ({
  getMemoryPageGuidance: jest.fn(() => 'テストガイダンス'),
  getMemoryDeleteAnnotation: jest.fn(() => 'テスト注釈'),
}));

const mockFetchSelfFacts = fetchSelfFacts as jest.MockedFunction<typeof fetchSelfFacts>;
const mockDeleteSelfFact = deleteSelfFact as jest.MockedFunction<typeof deleteSelfFact>;
const mockUseCharacter = useCharacter as jest.MockedFunction<typeof useCharacter>;
const mockMemoryList = jest.mocked(MemoryList);

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchSelfFacts.mockResolvedValue([]);
  mockDeleteSelfFact.mockResolvedValue(undefined);
  mockUseCharacter.mockReturnValue({ characterId: 'hiyori', setCharacterId: jest.fn() });
  // デフォルトのモック実装（loaded/loading 表示）に戻す
  mockMemoryList.mockImplementation(({ loading }) => (
    <div data-testid="memory-list">{loading ? 'loading' : 'loaded'}</div>
  ));
});

describe('MemoryPage（characterId 連携）', () => {
  it('マウント時に useCharacter の characterId を fetchSelfFacts に渡す', async () => {
    mockUseCharacter.mockReturnValue({ characterId: 'hiyori', setCharacterId: jest.fn() });
    render(<MemoryPage />);

    await waitFor(() => {
      expect(mockFetchSelfFacts).toHaveBeenCalledWith('hiyori');
    });
  });

  it('useCharacter が ageha を返す場合、fetchSelfFacts に ageha を渡す', async () => {
    mockUseCharacter.mockReturnValue({ characterId: 'ageha', setCharacterId: jest.fn() });
    render(<MemoryPage />);

    await waitFor(() => {
      expect(mockFetchSelfFacts).toHaveBeenCalledWith('ageha');
    });
  });

  it('ローディング中に "loading" が表示される', () => {
    // resolve しないことでローディング状態を維持
    mockFetchSelfFacts.mockReturnValue(new Promise(() => {}));
    render(<MemoryPage />);
    expect(screen.getByTestId('memory-list')).toHaveTextContent('loading');
  });

  it('取得完了後に "loaded" が表示される', async () => {
    render(<MemoryPage />);
    await waitFor(() => {
      expect(screen.getByTestId('memory-list')).toHaveTextContent('loaded');
    });
  });

  it('fetchSelfFacts が失敗するとエラーメッセージが表示される', async () => {
    mockFetchSelfFacts.mockRejectedValueOnce(new Error('覚えていることの取得に失敗しました'));
    render(<MemoryPage />);

    await waitFor(() => {
      // MuiAlert と エラー Typography の両方が role=alert を持つため、AllByRole で検索する
      const alerts = screen.getAllByRole('alert');
      const errorAlert = alerts.find((el) => el.textContent === '覚えていることの取得に失敗しました');
      expect(errorAlert).toBeTruthy();
    });
  });

  it('Tier タブが存在しない', async () => {
    render(<MemoryPage />);
    await waitFor(() => {
      expect(screen.queryByTestId(/tier-tab/)).not.toBeInTheDocument();
    });
  });
});

describe('MemoryPage レースコンディション対策', () => {
  it('古い fetch が後から解決しても最新の characterId の結果だけが反映される', async () => {
    // hiyori の取得を遅延（解決させない Promise で制御）
    let resolveHiyori!: (value: never[]) => void;
    const hiyoriPromise = new Promise<never[]>((resolve) => {
      resolveHiyori = resolve;
    });

    // MemoryList をメモリ内容を確認できる実装に差し替える
    mockMemoryList.mockImplementation(
      ({
        items,
        loading,
      }: {
        items: Array<{ id: string; text: string }>;
        loading: boolean;
      }) => (
        <div data-testid="memory-list">
          {loading ? 'loading' : items.map((m) => <span key={m.id}>{m.text}</span>)}
        </div>
      )
    );

    // 1回目（hiyori）は遅延、2回目（ageha）は即時解決
    mockFetchSelfFacts.mockReturnValueOnce(hiyoriPromise).mockResolvedValueOnce([
      {
        id: 'fact-ageha-1',
        topicId: 't1',
        subject: 'テスト',
        text: 'アゲハの記憶',
        createdAt: 1,
      },
    ]);

    // まず hiyori として描画（1回目の fetch が始まる）
    mockUseCharacter.mockReturnValue({ characterId: 'hiyori', setCharacterId: jest.fn() });
    const { rerender } = render(<MemoryPage />);

    // ageha に切り替えて再描画（2回目の fetch が始まる）
    mockUseCharacter.mockReturnValue({ characterId: 'ageha', setCharacterId: jest.fn() });
    rerender(<MemoryPage />);

    // 2回目（ageha）が先に解決するのを待つ
    await waitFor(() => {
      expect(screen.getByTestId('memory-list')).toHaveTextContent('アゲハの記憶');
    });

    // 遅れて 1回目（hiyori）を解決しても画面は変わらない
    resolveHiyori([]);
    await new Promise((r) => setTimeout(r, 50));

    // ageha の結果が表示されたままであること
    expect(screen.getByTestId('memory-list')).toHaveTextContent('アゲハの記憶');
  });
});
