import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlanActionButton } from '../../../../src/app/plans/plan-actions';
import { requestRedirectUrl } from '../../../../src/lib/billing-client';
import { navigateTo } from '../../../../src/lib/navigate';

jest.mock('../../../../src/lib/billing-client', () => ({ requestRedirectUrl: jest.fn() }));
jest.mock('../../../../src/lib/navigate', () => ({ navigateTo: jest.fn() }));

function renderButton() {
  render(
    <PlanActionButton
      endpoint="/api/billing/checkout"
      body={{ roleId: 'livetalk-standard' }}
      label="申し込む"
    />
  );
}

describe('PlanActionButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('API が返した URL へ遷移する', async () => {
    (requestRedirectUrl as jest.Mock).mockResolvedValue({ ok: true, url: 'https://stripe.test/x' });
    renderButton();

    await userEvent.click(screen.getByRole('button', { name: '申し込む' }));

    expect(requestRedirectUrl).toHaveBeenCalledWith('/api/billing/checkout', {
      roleId: 'livetalk-standard',
    });
    await waitFor(() => expect(navigateTo).toHaveBeenCalledWith('https://stripe.test/x'));
  });

  it('失敗したら日本語のエラーを出し、遷移しない', async () => {
    (requestRedirectUrl as jest.Mock).mockResolvedValue({
      ok: false,
      message: 'このプランは既に契約中です',
    });
    renderButton();

    await userEvent.click(screen.getByRole('button', { name: '申し込む' }));

    expect(await screen.findByText('このプランは既に契約中です')).toBeInTheDocument();
    expect(navigateTo).not.toHaveBeenCalled();
  });
});
