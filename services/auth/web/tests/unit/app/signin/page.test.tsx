import { render, screen } from '@testing-library/react';
import SignInPage from '../../../../src/app/signin/page';
import { auth } from '../../../../src/lib/auth/auth';

const mockRedirect = jest.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

jest.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'auth.nagiyu.com' }),
}));
jest.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
}));
jest.mock('../../../../src/lib/auth/auth', () => ({
  auth: jest.fn(),
  signIn: jest.fn(),
}));

function renderPage(searchParams: { callbackUrl?: string | string[] } = {}) {
  return SignInPage({ searchParams: Promise.resolve(searchParams) });
}

describe('SignInPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AUTH_URL = 'https://auth.nagiyu.com';
  });

  describe('ログイン済み', () => {
    beforeEach(() => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'u1' } });
    });

    it('許可された戻り先へ移す', async () => {
      await expect(renderPage({ callbackUrl: 'https://admin.nagiyu.com/' })).rejects.toThrow(
        'NEXT_REDIRECT'
      );

      expect(mockRedirect).toHaveBeenCalledWith('https://admin.nagiyu.com/');
    });

    it('auth 内の相対パスは絶対 URL にして移す', async () => {
      await expect(renderPage({ callbackUrl: '/plans' })).rejects.toThrow('NEXT_REDIRECT');

      expect(mockRedirect).toHaveBeenCalledWith('https://auth.nagiyu.com/plans');
    });

    it('許可されない戻り先はダッシュボードへ移す', async () => {
      await expect(renderPage({ callbackUrl: 'https://example.com/' })).rejects.toThrow(
        'NEXT_REDIRECT'
      );

      expect(mockRedirect).toHaveBeenCalledWith('/dashboard');
    });

    it('戻り先が無ければダッシュボードへ移す', async () => {
      await expect(renderPage()).rejects.toThrow('NEXT_REDIRECT');

      expect(mockRedirect).toHaveBeenCalledWith('/dashboard');
    });

    it('同じキーを重ねた callbackUrl は無いものとして扱う', async () => {
      await expect(
        renderPage({ callbackUrl: ['https://admin.nagiyu.com/', '/b'] })
      ).rejects.toThrow('NEXT_REDIRECT');

      expect(mockRedirect).toHaveBeenCalledWith('/dashboard');
    });
  });

  describe('未ログイン', () => {
    it.each([null, {}])('ボタンを出し、移さない (session=%j)', async (session) => {
      (auth as jest.Mock).mockResolvedValue(session);

      render(await renderPage({ callbackUrl: 'https://admin.nagiyu.com/' }));

      expect(screen.getByRole('button', { name: 'Google でサインイン' })).toBeInTheDocument();
      expect(mockRedirect).not.toHaveBeenCalled();
    });
  });
});
