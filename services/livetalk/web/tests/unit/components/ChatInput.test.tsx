import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatInput from '@/components/ChatInput';

describe('ChatInput', () => {
  describe('基本動作', () => {
    it('テキスト入力後に送信ボタンをクリックすると onSubmit が呼ばれる', async () => {
      const onSubmit = jest.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();

      render(<ChatInput onSubmit={onSubmit} />);
      const input = screen.getByPlaceholderText('メッセージを入力');

      await user.type(input, 'こんにちは');
      await user.click(screen.getByRole('button', { name: '送信' }));

      expect(onSubmit).toHaveBeenCalledWith('こんにちは');
    });

    it('空文字のままでは送信されない', async () => {
      const onSubmit = jest.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();

      render(<ChatInput onSubmit={onSubmit} />);
      await user.click(screen.getByRole('button', { name: '送信' }));

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('スペースのみの入力では送信されない', async () => {
      const onSubmit = jest.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();

      render(<ChatInput onSubmit={onSubmit} />);
      const input = screen.getByPlaceholderText('メッセージを入力');

      await user.type(input, '   ');
      await user.click(screen.getByRole('button', { name: '送信' }));

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('送信後に入力欄がクリアされる', async () => {
      const onSubmit = jest.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();

      render(<ChatInput onSubmit={onSubmit} />);
      const input = screen.getByPlaceholderText('メッセージを入力');

      await user.type(input, 'テスト');
      await user.click(screen.getByRole('button', { name: '送信' }));

      expect(input).toHaveValue('');
    });

    it('disabled が true のとき入力欄と送信ボタンが無効化される', () => {
      const onSubmit = jest.fn().mockResolvedValue(undefined);

      render(<ChatInput onSubmit={onSubmit} disabled />);

      expect(screen.getByPlaceholderText('メッセージを入力')).toBeDisabled();
      expect(screen.getByRole('button', { name: '送信' })).toBeDisabled();
    });
  });

  describe('prefillText によるプリフィル', () => {
    it('prefillText を渡すと入力欄にプリフィルされる', async () => {
      const onSubmit = jest.fn().mockResolvedValue(undefined);

      render(<ChatInput onSubmit={onSubmit} prefillText="TypeScriptについて教えて" />);
      const input = screen.getByPlaceholderText('メッセージを入力');

      await waitFor(() => expect(input).toHaveValue('TypeScriptについて教えて'));
    });

    it('prefillText が変化すると入力欄に再反映される', async () => {
      const onSubmit = jest.fn().mockResolvedValue(undefined);

      const { rerender } = render(<ChatInput onSubmit={onSubmit} prefillText="最初のサジェスト" />);
      const input = screen.getByPlaceholderText('メッセージを入力');

      await waitFor(() => expect(input).toHaveValue('最初のサジェスト'));

      rerender(<ChatInput onSubmit={onSubmit} prefillText="次のサジェスト" />);

      await waitFor(() => expect(input).toHaveValue('次のサジェスト'));
    });

    it('prefillText なし（undefined）の場合はプリフィルされない', () => {
      const onSubmit = jest.fn().mockResolvedValue(undefined);

      render(<ChatInput onSubmit={onSubmit} />);
      const input = screen.getByPlaceholderText('メッセージを入力');

      expect(input).toHaveValue('');
    });

    it('prefillText が空文字の場合はプリフィルされない', async () => {
      const onSubmit = jest.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();

      render(<ChatInput onSubmit={onSubmit} prefillText="" />);
      const input = screen.getByPlaceholderText('メッセージを入力');

      expect(input).toHaveValue('');

      // 手動で入力した後に空の prefillText が再変化しても上書きしない
      await user.type(input, 'ユーザー入力');
      expect(input).toHaveValue('ユーザー入力');
    });

    it('プリフィルされた内容はそのまま送信できる', async () => {
      const onSubmit = jest.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();

      render(<ChatInput onSubmit={onSubmit} prefillText="TypeScriptについて教えて" />);
      const input = screen.getByPlaceholderText('メッセージを入力');

      await waitFor(() => expect(input).toHaveValue('TypeScriptについて教えて'));

      await user.click(screen.getByRole('button', { name: '送信' }));

      expect(onSubmit).toHaveBeenCalledWith('TypeScriptについて教えて');
    });

    it('プリフィル後に送信すると入力欄がクリアされる', async () => {
      const onSubmit = jest.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();

      render(<ChatInput onSubmit={onSubmit} prefillText="サジェスト" />);
      const input = screen.getByPlaceholderText('メッセージを入力');

      await waitFor(() => expect(input).toHaveValue('サジェスト'));

      await user.click(screen.getByRole('button', { name: '送信' }));

      expect(input).toHaveValue('');
    });
  });
});
