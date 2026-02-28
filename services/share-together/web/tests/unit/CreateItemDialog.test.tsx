import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { CreateItemDialog } from '@/components/CreateItemDialog';

describe('CreateItemDialog', () => {
  it('タイトル・ラベル・ボタンを表示する', () => {
    render(
      <CreateItemDialog
        open={true}
        title="リストを作成"
        label="リスト名"
        onClose={jest.fn()}
        onCreate={jest.fn()}
      />
    );

    expect(screen.getByText('リストを作成')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'リスト名' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '作成' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'キャンセル' })).toBeInTheDocument();
  });

  it('名前が空のときは作成ボタンを無効化する', () => {
    render(
      <CreateItemDialog
        open={true}
        title="グループを作成"
        label="グループ名"
        onClose={jest.fn()}
        onCreate={jest.fn()}
      />
    );

    expect(screen.getByRole('button', { name: '作成' })).toBeDisabled();
  });

  it('名前を入力すると作成ボタンが有効になり、クリックで onCreate を呼び出す', () => {
    const onCreate = jest.fn();
    const onClose = jest.fn();

    render(
      <CreateItemDialog
        open={true}
        title="グループを作成"
        label="グループ名"
        onClose={onClose}
        onCreate={onCreate}
      />
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'グループ名' }), {
      target: { value: '新しいグループ' },
    });

    const createButton = screen.getByRole('button', { name: '作成' });
    expect(createButton).not.toBeDisabled();

    fireEvent.click(createButton);
    expect(onCreate).toHaveBeenCalledWith('新しいグループ');
    expect(onClose).toHaveBeenCalled();
  });

  it('キャンセルボタンをクリックすると onClose を呼び出し名前をリセットする', () => {
    const onClose = jest.fn();

    render(
      <CreateItemDialog
        open={true}
        title="リストを作成"
        label="リスト名"
        onClose={onClose}
        onCreate={jest.fn()}
      />
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'リスト名' }), {
      target: { value: 'テストリスト' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(onClose).toHaveBeenCalled();
  });
});
