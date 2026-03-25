import { render, screen } from '@testing-library/react';
import ErrorAlert from '../../../../src/components/error/ErrorAlert';

describe('ErrorAlert', () => {
  it('message が空なら表示しない', () => {
    const { container } = render(<ErrorAlert message="" />);
    expect(container.firstChild).toBeNull();
  });

  it('message と title を表示する', () => {
    render(<ErrorAlert message="エラーメッセージ" title="エラー" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('エラー')).toBeInTheDocument();
    expect(screen.getByText('エラーメッセージ')).toBeInTheDocument();
  });
});
