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
