import { render, screen } from '@testing-library/react';
import SignInPage from '../../../../src/app/signin/page';
import { SIGNIN_ERROR_MESSAGES } from '../../../../src/lib/signin-error-message';
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

function renderPage(
  searchParams: { callbackUrl?: string | string[]; error?: string | string[] } = {}
) {
  return SignInPage({ searchParams: Promise.resolve(searchParams) });
}

describe('SignInPage', () => {
  const originalAuthUrl = process.env.AUTH_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AUTH_URL = 'https://auth.nagiyu.com';
  });

  afterAll(() => {
    process.env.AUTH_URL = originalAuthUrl;
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

    it('戻り先がサインイン画面自身なら /dashboard へ移す', async () => {
      await expect(renderPage({ callbackUrl: '/signin?callbackUrl=%2Fplans' })).rejects.toThrow(
        'NEXT_REDIRECT'
      );

      expect(mockRedirect).toHaveBeenCalledWith('/dashboard');
    });

    it('他サービスの /signin は自身ではないのでそのまま移す', async () => {
      await expect(renderPage({ callbackUrl: 'https://admin.nagiyu.com/signin' })).rejects.toThrow(
        'NEXT_REDIRECT'
      );

      expect(mockRedirect).toHaveBeenCalledWith('https://admin.nagiyu.com/signin');
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

  describe('ログイン済みで error 付き', () => {
    it('移さず、Alert 付きのサインイン画面を出す', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'u1' } });

      render(await renderPage({ error: 'MissingCSRF' }));

      expect(screen.getByRole('alert')).toHaveTextContent(SIGNIN_ERROR_MESSAGES.MissingCSRF);
      expect(mockRedirect).not.toHaveBeenCalled();
    });

    it('同じキーを重ねた error は無いものとして扱い、移す', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'u1' } });

      await expect(renderPage({ error: ['MissingCSRF', 'OAuthCallbackError'] })).rejects.toThrow(
        'NEXT_REDIRECT'
      );

      expect(mockRedirect).toHaveBeenCalledWith('/dashboard');
    });

    it('空の error は無いものとして扱い、移す', async () => {
      (auth as jest.Mock).mockResolvedValue({ user: { id: 'u1' } });

      await expect(renderPage({ error: '' })).rejects.toThrow('NEXT_REDIRECT');

      expect(mockRedirect).toHaveBeenCalledWith('/dashboard');
    });
  });

  describe('未ログインの error 表示', () => {
    beforeEach(() => {
      (auth as jest.Mock).mockResolvedValue(null);
    });

    it('error に対応する文を Alert で出す', async () => {
      render(await renderPage({ error: 'OAuthCallbackError' }));

      expect(screen.getByRole('alert')).toHaveTextContent(SIGNIN_ERROR_MESSAGES.OAuthCallbackError);
      expect(screen.getByRole('button', { name: 'Google でサインイン' })).toBeInTheDocument();
    });

    it('未知の error は既定の文を出す', async () => {
      render(await renderPage({ error: '__proto__' }));

      expect(screen.getByRole('alert')).toHaveTextContent(SIGNIN_ERROR_MESSAGES.Default);
    });

    it('error が無ければ Alert を出さない', async () => {
      render(await renderPage());

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('同じキーを重ねた error は無いものとして扱う', async () => {
      render(await renderPage({ error: ['MissingCSRF', 'Configuration'] }));

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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
