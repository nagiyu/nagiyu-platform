import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  it('名前を入力してエンターキーを押すと onCreate が trim 済みの名前で呼ばれ onClose も呼ばれる', () => {
    const onCreate = jest.fn();
    const onClose = jest.fn();

    render(
      <CreateItemDialog
        open={true}
        title="リストを作成"
        label="リスト名"
        onClose={onClose}
        onCreate={onCreate}
      />
    );

    const input = screen.getByRole('textbox', { name: 'リスト名' });
    fireEvent.change(input, { target: { value: '  新しいリスト  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onCreate).toHaveBeenCalledWith('新しいリスト');
    expect(onClose).toHaveBeenCalled();
  });

  it('名前が空のときはエンターキーを押しても onCreate を呼ばない', () => {
    const onCreate = jest.fn();

    render(
      <CreateItemDialog
        open={true}
        title="リストを作成"
        label="リスト名"
        onClose={jest.fn()}
        onCreate={onCreate}
      />
    );

    const input = screen.getByRole('textbox', { name: 'リスト名' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onCreate).not.toHaveBeenCalled();
  });

  it('initialValue を入力欄に入れて開き、submitLabel を確定ボタンの文言にする', () => {
    render(
      <CreateItemDialog
        open={true}
        title="リスト名を変更"
        label="リスト名"
        initialValue="仕事"
        submitLabel="保存"
        onClose={jest.fn()}
        onCreate={jest.fn()}
      />
    );

    expect(screen.getByRole('textbox', { name: 'リスト名' })).toHaveValue('仕事');
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: '作成' })).not.toBeInTheDocument();
  });

  it('開き直すたびに、直前の入力ではなく initialValue から始める', async () => {
    const renderDialog = (open: boolean, initialValue: string) => (
      <CreateItemDialog
        open={open}
        title="リスト名を変更"
        label="リスト名"
        initialValue={initialValue}
        onClose={jest.fn()}
        onCreate={jest.fn()}
      />
    );
    const { rerender } = render(renderDialog(true, '仕事'));
    fireEvent.change(screen.getByRole('textbox', { name: 'リスト名' }), {
      target: { value: '書きかけ' },
    });

    rerender(renderDialog(false, ''));
    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: 'リスト名' })).not.toBeInTheDocument();
    });
    rerender(renderDialog(true, '買い物'));

    expect(screen.getByRole('textbox', { name: 'リスト名' })).toHaveValue('買い物');
  });

  it('initialValue のままエンターキーを押すと、その名前で onCreate を呼ぶ', () => {
    const onCreate = jest.fn();

    render(
      <CreateItemDialog
        open={true}
        title="リスト名を変更"
        label="リスト名"
        initialValue="仕事"
        onClose={jest.fn()}
        onCreate={onCreate}
      />
    );

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'リスト名' }), { key: 'Enter' });

    expect(onCreate).toHaveBeenCalledWith('仕事');
  });

  it('initialValue を指定しない既定では、空の入力欄と「作成」ボタンで開く', () => {
    render(
      <CreateItemDialog
        open={true}
        title="リストを作成"
        label="リスト名"
        onClose={jest.fn()}
        onCreate={jest.fn()}
      />
    );

    expect(screen.getByRole('textbox', { name: 'リスト名' })).toHaveValue('');
    expect(screen.getByRole('button', { name: '作成' })).toBeDisabled();
  });
});
