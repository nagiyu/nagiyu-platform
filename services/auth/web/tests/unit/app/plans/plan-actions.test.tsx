import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  PlanActionButton,
  ScheduledChangeCancelButton,
} from '../../../../src/app/plans/plan-actions';
import {
  requestCancelScheduledChange,
  requestRedirectUrl,
} from '../../../../src/lib/billing-client';
import { navigateTo } from '../../../../src/lib/navigate';

const mockRefresh = jest.fn();

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }));
jest.mock('../../../../src/lib/billing-client', () => ({
  requestRedirectUrl: jest.fn(),
  requestCancelScheduledChange: jest.fn(),
}));
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

describe('ScheduledChangeCancelButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('サービスの予約を取り消し、成功したら画面を読み直す', async () => {
    (requestCancelScheduledChange as jest.Mock).mockResolvedValue({ ok: true });
    render(<ScheduledChangeCancelButton serviceId="quick-clip" />);

    await userEvent.click(screen.getByRole('button', { name: '予約を取り消す' }));

    expect(requestCancelScheduledChange).toHaveBeenCalledWith('quick-clip');
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it('失敗したら日本語のエラーを出し、読み直さない', async () => {
    (requestCancelScheduledChange as jest.Mock).mockResolvedValue({
      ok: false,
      message: '取り消せませんでした',
    });
    render(<ScheduledChangeCancelButton serviceId="quick-clip" />);

    await userEvent.click(screen.getByRole('button', { name: '予約を取り消す' }));

    expect(await screen.findByText('取り消せませんでした')).toBeInTheDocument();
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
