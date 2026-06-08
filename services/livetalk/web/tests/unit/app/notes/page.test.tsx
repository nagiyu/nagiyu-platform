import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import NotesPage from '@/app/notes/page';
import { fetchNotes } from '@/lib/notes/api-client';
import { useCharacter } from '@/lib/characters/CharacterContext';

// api-client をモック
jest.mock('@/lib/notes/api-client', () => ({
  fetchNotes: jest.fn(),
  fetchNote: jest.fn(),
}));

// useCharacter をモック
jest.mock('@/lib/characters/CharacterContext', () => ({
  useCharacter: jest.fn(() => ({
    characterId: 'hiyori',
    setCharacterId: jest.fn(),
  })),
}));

// NoteList は DOM 描画確認に不要なためモック
jest.mock('@/components/NoteList', () => ({
  __esModule: true,
  default: jest.fn(({ loading }: { notes: unknown[]; loading: boolean }) => (
    <div data-testid="note-list">{loading ? 'loading' : 'loaded'}</div>
  )),
}));

// @nagiyu/ui の Link コンポーネントをモック
jest.mock('@nagiyu/ui', () => ({
  Link: jest.fn(({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  )),
}));

// messages のモジュールは getCharacterDisplay を呼ぶため直接モック
jest.mock('@/lib/notes/messages', () => ({
  NOTE_PAGE_GUIDANCE: 'テストノートガイダンス',
  formatNoteDate: jest.fn((ts: number) => String(ts)),
}));

const mockFetchNotes = fetchNotes as jest.MockedFunction<typeof fetchNotes>;
const mockUseCharacter = useCharacter as jest.MockedFunction<typeof useCharacter>;

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchNotes.mockResolvedValue([]);
  mockUseCharacter.mockReturnValue({ characterId: 'hiyori', setCharacterId: jest.fn() });
});

describe('NotesPage（characterId 連携）', () => {
  it('マウント時に useCharacter の characterId を fetchNotes に渡す', async () => {
    mockUseCharacter.mockReturnValue({ characterId: 'hiyori', setCharacterId: jest.fn() });
    render(<NotesPage />);

    await waitFor(() => {
      expect(mockFetchNotes).toHaveBeenCalledWith('hiyori');
    });
  });

  it('useCharacter が ageha を返す場合、fetchNotes に ageha を渡す', async () => {
    mockUseCharacter.mockReturnValue({ characterId: 'ageha', setCharacterId: jest.fn() });
    render(<NotesPage />);

    await waitFor(() => {
      expect(mockFetchNotes).toHaveBeenCalledWith('ageha');
    });
  });

  it('ローディング中に "loading" が表示される', () => {
    mockFetchNotes.mockReturnValue(new Promise(() => {}));
    render(<NotesPage />);
    expect(screen.getByTestId('note-list')).toHaveTextContent('loading');
  });

  it('取得完了後に "loaded" が表示される', async () => {
    render(<NotesPage />);
    await waitFor(() => {
      expect(screen.getByTestId('note-list')).toHaveTextContent('loaded');
    });
  });

  it('fetchNotes が失敗するとエラーメッセージが表示される', async () => {
    mockFetchNotes.mockRejectedValueOnce(new Error('ノートの取得に失敗しました'));
    render(<NotesPage />);

    await waitFor(() => {
      // MuiAlert と エラー Typography の両方が role=alert を持つため、AllByRole で検索する
      const alerts = screen.getAllByRole('alert');
      const errorAlert = alerts.find((el) => el.textContent === 'ノートの取得に失敗しました');
      expect(errorAlert).toBeTruthy();
    });
  });
});
