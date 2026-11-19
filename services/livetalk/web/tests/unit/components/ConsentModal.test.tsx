import { fireEvent, render, screen } from '@testing-library/react';
import ConsentModal from '@/components/ConsentModal';

function checkAll() {
  for (const checkbox of screen.getAllByRole('checkbox')) {
    fireEvent.click(checkbox);
  }
}

describe('ConsentModal', () => {
  it('3 つすべてにチェックすると「利用開始」が押せる', () => {
    render(<ConsentModal open={true} onConsented={jest.fn()} />);
    expect(screen.getByTestId('consent-submit')).toBeDisabled();

    checkAll();

    expect(screen.getByTestId('consent-submit')).toBeEnabled();
  });

  it('閉じてから開き直すと、チェックが外れた状態から始まる', () => {
    const { rerender } = render(<ConsentModal open={true} onConsented={jest.fn()} />);
    checkAll();
    expect(screen.getByTestId('consent-submit')).toBeEnabled();

    rerender(<ConsentModal open={false} onConsented={jest.fn()} />);
    rerender(<ConsentModal open={true} onConsented={jest.fn()} />);

    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox).not.toBeChecked();
    }
    expect(screen.getByTestId('consent-submit')).toBeDisabled();
  });

  it('開いたままの再描画では、チェックを保つ', () => {
    const { rerender } = render(<ConsentModal open={true} onConsented={jest.fn()} />);
    checkAll();

    rerender(<ConsentModal open={true} onConsented={jest.fn()} />);

    expect(screen.getByTestId('consent-submit')).toBeEnabled();
  });
});
