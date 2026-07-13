import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import NotesPage from '@/app/notes/page';
import { fetchNotes } from '@/lib/notes/api-client';
import { useCharacter } from '@/lib/characters/CharacterContext';
import NoteList from '@/components/NoteList';

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

// messages のモジュールは getCharacterDisplay を呼ぶため関数ごとモック
jest.mock('@/lib/notes/messages', () => ({
  getNotePageGuidance: jest.fn(() => 'テストノートガイダンス'),
  getNoteEmptyMessage: jest.fn(() => 'テスト空メッセージ'),
  formatNoteDate: jest.fn((ts: number) => String(ts)),
}));

const mockFetchNotes = fetchNotes as jest.MockedFunction<typeof fetchNotes>;
const mockUseCharacter = useCharacter as jest.MockedFunction<typeof useCharacter>;
const mockNoteList = jest.mocked(NoteList);

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchNotes.mockResolvedValue([]);
  mockUseCharacter.mockReturnValue({ characterId: 'hiyori', setCharacterId: jest.fn() });
  // デフォルトのモック実装（loaded/loading 表示）に戻す
  mockNoteList.mockImplementation(({ loading }) => (
    <div data-testid="note-list">{loading ? 'loading' : 'loaded'}</div>
  ));
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

describe('NotesPage レースコンディション対策', () => {
  it('古い fetch が後から解決しても最新の characterId の結果だけが反映される', async () => {
    // hiyori の取得を遅延（解決させない Promise で制御）
    let resolveHiyori!: (value: never[]) => void;
    const hiyoriPromise = new Promise<never[]>((resolve) => {
      resolveHiyori = resolve;
    });

    // NoteList をノート内容を確認できる実装に差し替える
    mockNoteList.mockImplementation(
      ({ notes, loading }: { notes: Array<{ id: string; subject: string }>; loading: boolean }) => (
        <div data-testid="note-list">
          {loading ? 'loading' : notes.map((n) => <span key={n.id}>{n.subject}</span>)}
        </div>
      )
    );

    // 1回目（hiyori）は遅延、2回目（ageha）は即時解決
    mockFetchNotes
      .mockReturnValueOnce(hiyoriPromise)
      .mockResolvedValueOnce([{ id: 'note-ageha-1', subject: 'アゲハのノート', sharedAt: 1 }]);

    // まず hiyori として描画（1回目の fetch が始まる）
    mockUseCharacter.mockReturnValue({ characterId: 'hiyori', setCharacterId: jest.fn() });
    const { rerender } = render(<NotesPage />);

    // ageha に切り替えて再描画（2回目の fetch が始まる）
    mockUseCharacter.mockReturnValue({ characterId: 'ageha', setCharacterId: jest.fn() });
    rerender(<NotesPage />);

    // 2回目（ageha）が先に解決するのを待つ
    await waitFor(() => {
      expect(screen.getByTestId('note-list')).toHaveTextContent('アゲハのノート');
    });

    // 遅れて 1回目（hiyori）を解決しても画面は変わらない
    resolveHiyori([]);
    await new Promise((r) => setTimeout(r, 50));

    // ageha の結果が表示されたままであること
    expect(screen.getByTestId('note-list')).toHaveTextContent('アゲハのノート');
  });
});
