/**
 * Unit tests for SignInButton component
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { signIn } from 'next-auth/react';
import { SignInButton } from '../../../src/components/signin-button';

// Mock next-auth/react
jest.mock('next-auth/react', () => ({
  signIn: jest.fn(),
}));

describe('SignInButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('レンダリング', () => {
    it('Google サインインボタンが表示される', () => {
      render(<SignInButton callbackUrl="/dashboard" />);

      const button = screen.getByRole('button', { name: /Google でサインイン/i });
      expect(button).toBeInTheDocument();
    });

    it('Google アイコンが表示される', () => {
      render(<SignInButton callbackUrl="/dashboard" />);

      const button = screen.getByRole('button', { name: /Google でサインイン/i });
      // Material-UIのGoogleIconはSVGとして描画される
      expect(button.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('サインイン処理', () => {
    it('ボタンクリック時に signIn が callbackUrl 付きで呼ばれる', async () => {
      (signIn as jest.Mock).mockResolvedValue(undefined);
      const callbackUrl = 'https://dev-niconico-mylist-assistant.nagiyu.com/';
      render(<SignInButton callbackUrl={callbackUrl} />);

      const button = screen.getByRole('button', { name: /Google でサインイン/i });
      fireEvent.click(button);

      expect(signIn).toHaveBeenCalledWith('google', {
        callbackUrl,
      });
    });

    it('デフォルトの callbackUrl でも正しく動作する', async () => {
      (signIn as jest.Mock).mockResolvedValue(undefined);
      const callbackUrl = '/dashboard';
      render(<SignInButton callbackUrl={callbackUrl} />);

      const button = screen.getByRole('button', { name: /Google でサインイン/i });
      fireEvent.click(button);

      expect(signIn).toHaveBeenCalledWith('google', {
        callbackUrl,
      });
    });

    it('サインイン中はローディング状態を表示する', async () => {
      (signIn as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );
      const callbackUrl = '/dashboard';
      render(<SignInButton callbackUrl={callbackUrl} />);

      const button = screen.getByRole('button', { name: /Google でサインイン/i });
      fireEvent.click(button);

      // ローディング状態のテキストが表示される
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /サインイン中/i })).toBeInTheDocument();
      });

      // ボタンが無効化される
      expect(button).toBeDisabled();
    });

    it('signIn がエラーを投げた場合、エラーをログに出力する', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      (signIn as jest.Mock).mockRejectedValue(new Error('Test error'));

      const callbackUrl = '/dashboard';
      render(<SignInButton callbackUrl={callbackUrl} />);

      const button = screen.getByRole('button', { name: /Google でサインイン/i });
      fireEvent.click(button);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          'サインインエラー:',
          expect.any(Error)
        );
      });

      // エラー後、ボタンは再度有効になる
      await waitFor(() => {
        expect(button).not.toBeDisabled();
      });

      consoleErrorSpy.mockRestore();
    });
  });
});
