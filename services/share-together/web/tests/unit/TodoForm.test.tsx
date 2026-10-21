import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TodoForm } from '@/components/TodoForm';

describe('TodoForm', () => {
  it('タイトル入力欄と送信ボタンを表示し、送信後に入力をクリアする', async () => {
    render(<TodoForm />);

    const input = screen.getByRole('textbox', { name: 'タイトル' });
    const submitButton = screen.getByRole('button', { name: '追加' });

    fireEvent.change(input, { target: { value: '牛乳を買う' } });
    expect(input).toHaveValue('牛乳を買う');

    fireEvent.click(submitButton);
    await waitFor(() => {
      expect(input).toHaveValue('');
    });
  });

  it('onAdd が成功を返したときだけ入力をクリアする', async () => {
    const onAdd = jest.fn().mockResolvedValue(true);
    render(<TodoForm onAdd={onAdd} />);

    const input = screen.getByRole('textbox', { name: 'タイトル' });
    fireEvent.change(input, { target: { value: ' 牛乳を買う ' } });
    fireEvent.click(screen.getByRole('button', { name: '追加' }));

    expect(onAdd).toHaveBeenCalledWith('牛乳を買う');
    await waitFor(() => {
      expect(input).toHaveValue('');
    });
  });

  it('onAdd が失敗を返した場合は入力を残す', async () => {
    const onAdd = jest.fn().mockResolvedValue(false);
    render(<TodoForm onAdd={onAdd} />);

    const input = screen.getByRole('textbox', { name: 'タイトル' });
    fireEvent.change(input, { target: { value: '牛乳を買う' } });
    fireEvent.click(screen.getByRole('button', { name: '追加' }));

    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledTimes(1);
    });
    expect(input).toHaveValue('牛乳を買う');
  });

  it('送信中に入力が編集された場合は成功後も新しい入力を残す', async () => {
    let resolveAdd: ((value: boolean) => void) | undefined;
    const onAdd = jest.fn().mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveAdd = resolve;
        })
    );
    render(<TodoForm onAdd={onAdd} />);

    const input = screen.getByRole('textbox', { name: 'タイトル' });
    fireEvent.change(input, { target: { value: '牛乳を買う' } });
    fireEvent.click(screen.getByRole('button', { name: '追加' }));
    fireEvent.change(input, { target: { value: '卵を買う' } });
    resolveAdd?.(true);

    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledTimes(1);
    });
    await Promise.resolve();
    expect(input).toHaveValue('卵を買う');
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
