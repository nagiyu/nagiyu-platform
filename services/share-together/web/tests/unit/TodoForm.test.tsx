import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { TodoForm } from '@/components/TodoForm';

describe('TodoForm', () => {
  it('タイトル入力欄と送信ボタンを表示し、送信後に入力をクリアする', () => {
    render(<TodoForm />);

    const input = screen.getByRole('textbox', { name: 'タイトル' });
    const submitButton = screen.getByRole('button', { name: '追加' });

    fireEvent.change(input, { target: { value: '牛乳を買う' } });
    expect(input).toHaveValue('牛乳を買う');

    fireEvent.click(submitButton);
    expect(input).toHaveValue('');
  });

  it('空白のみの入力では送信ボタンが無効になる', () => {
    render(<TodoForm />);

    const input = screen.getByRole('textbox', { name: 'タイトル' });
    const submitButton = screen.getByRole('button', { name: '追加' });

    expect(submitButton).toBeDisabled();
    fireEvent.change(input, { target: { value: '   ' } });
    expect(submitButton).toBeDisabled();
  });
});
