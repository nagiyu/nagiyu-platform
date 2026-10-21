import { render, screen } from '@testing-library/react';
import LoadingState from '../../../../src/components/loading/LoadingState';

describe('LoadingState', () => {
  it('デフォルトメッセージを表示する', () => {
    render(<LoadingState />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('読み込み中...')).toBeInTheDocument();
  });

  it('カスタムメッセージを表示する', () => {
    render(<LoadingState message="データを取得中" />);
    expect(screen.getByLabelText('データを取得中')).toBeInTheDocument();
    expect(screen.getByText('データを取得中')).toBeInTheDocument();
  });
});

describe('LoadingState variant', () => {
  it('root に status 関連の aria 属性が付く', () => {
    render(<LoadingState />);
    const root = screen.getByRole('status');
    expect(root).toHaveAttribute('aria-live', 'polite');
    expect(root).toHaveAttribute('aria-busy', 'true');
  });

  it('内側のテキストに重複した aria-live を付けない', () => {
    render(<LoadingState />);
    expect(screen.getByText('読み込み中...')).not.toHaveAttribute('aria-live');
  });

  it('page ではメッセージをテキスト表示し minHeight 既定 400 を適用する', () => {
    render(<LoadingState variant="page" />);
    expect(screen.getByText('読み込み中...')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveStyle({ minHeight: '400px' });
  });

  it('inline ではメッセージをテキスト表示せず aria-label にだけ使う', () => {
    render(<LoadingState variant="inline" message="一覧を取得中" />);
    expect(screen.queryByText('一覧を取得中')).not.toBeInTheDocument();
    expect(screen.getByLabelText('一覧を取得中')).toBeInTheDocument();
  });

  it('inline では高さを固定しない', () => {
    render(<LoadingState variant="inline" />);
    expect(screen.getByRole('status')).not.toHaveStyle({ minHeight: '400px' });
  });

  it('inline でも minHeight を明示すれば適用する', () => {
    render(<LoadingState variant="inline" minHeight={120} />);
    expect(screen.getByRole('status')).toHaveStyle({ minHeight: '120px' });
  });

  it('data-testid を root 要素に付ける', () => {
    render(<LoadingState data-testid="sample-loading" />);
    expect(screen.getByTestId('sample-loading')).toBe(screen.getByRole('status'));
  });
});
