import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { getCsrfToken } from 'next-auth/react';
import SignOutForm, { ERROR_MESSAGES } from '@/app/auth/signout/signout-form';

jest.mock('next-auth/react', () => ({
  getCsrfToken: jest.fn(),
}));

const mockGetCsrfToken = getCsrfToken as jest.Mock;

function renderForm(cancelUrl = '/dashboard') {
  return render(<SignOutForm cancelUrl={cancelUrl} />);
}

describe('SignOutForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('日本語の見出しと確認文を表示する', async () => {
    mockGetCsrfToken.mockResolvedValue('token');

    renderForm();

    expect(screen.getByRole('heading', { level: 1, name: 'サインアウト' })).toBeInTheDocument();
    expect(screen.getByText('サインアウトしますか?')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'サインアウト' })).toBeEnabled());
  });

  it('CSRF トークンを取得するまでサインアウトボタンを無効にする', async () => {
    let resolveToken: (token: string) => void = () => {};
    mockGetCsrfToken.mockReturnValue(
      new Promise<string>((resolve) => {
        resolveToken = resolve;
      })
    );

    renderForm();

    expect(screen.getByRole('button', { name: 'サインアウト' })).toBeDisabled();

    resolveToken('token');

    await waitFor(() => expect(screen.getByRole('button', { name: 'サインアウト' })).toBeEnabled());
  });

  it('取得した CSRF トークンを hidden input に入れ、/api/auth/signout へ POST する form にする', async () => {
    mockGetCsrfToken.mockResolvedValue('csrf-token-value');

    const { container } = renderForm();

    await waitFor(() => expect(screen.getByRole('button', { name: 'サインアウト' })).toBeEnabled());

    const form = container.querySelector('form');
    expect(form).toHaveAttribute('method', 'post');
    expect(form).toHaveAttribute('action', '/api/auth/signout');
    expect(container.querySelector('input[name="csrfToken"]')).toHaveValue('csrf-token-value');
  });

  it('callbackUrl は form に含めない (next-auth が Cookie の検証済みの値を使う)', async () => {
    mockGetCsrfToken.mockResolvedValue('token');

    const { container } = renderForm('https://admin.nagiyu.com/');

    await waitFor(() => expect(screen.getByRole('button', { name: 'サインアウト' })).toBeEnabled());

    expect(container.querySelector('input[name="callbackUrl"]')).toBeNull();
  });

  it('キャンセルは渡された戻り先へのリンクにする', async () => {
    mockGetCsrfToken.mockResolvedValue('token');

    renderForm('https://admin.nagiyu.com/');

    expect(screen.getByRole('link', { name: 'キャンセル' })).toHaveAttribute(
      'href',
      'https://admin.nagiyu.com/'
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'サインアウト' })).toBeEnabled());
  });

  it('CSRF トークンの取得が失敗したらエラーを表示し、ボタンは無効のままにする', async () => {
    mockGetCsrfToken.mockRejectedValue(new Error('network'));

    renderForm();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      ERROR_MESSAGES.CSRF_TOKEN_FETCH_FAILED
    );
    expect(screen.getByRole('button', { name: 'サインアウト' })).toBeDisabled();
  });

  it('CSRF トークンが空で返ってきてもエラーを表示する', async () => {
    mockGetCsrfToken.mockResolvedValue(undefined);

    renderForm();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      ERROR_MESSAGES.CSRF_TOKEN_FETCH_FAILED
    );
    expect(screen.getByRole('button', { name: 'サインアウト' })).toBeDisabled();
  });
});
