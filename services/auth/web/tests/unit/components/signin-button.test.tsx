/**
 * Unit tests for SignInButton component
 */

import { render, screen, fireEvent } from '@testing-library/react';
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
      const callbackUrl = 'https://dev-niconico-mylist-assistant.nagiyu.com/';
      render(<SignInButton callbackUrl={callbackUrl} />);

      const button = screen.getByRole('button', { name: /Google でサインイン/i });
      fireEvent.click(button);

      expect(signIn).toHaveBeenCalledWith('google', {
        callbackUrl,
      });
    });

    it('デフォルトの callbackUrl でも正しく動作する', async () => {
      const callbackUrl = '/dashboard';
      render(<SignInButton callbackUrl={callbackUrl} />);

      const button = screen.getByRole('button', { name: /Google でサインイン/i });
      fireEvent.click(button);

      expect(signIn).toHaveBeenCalledWith('google', {
        callbackUrl,
      });
    });
  });
});
