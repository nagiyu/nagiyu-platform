import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConfirmDialog } from '@/components/ConfirmDialog';

describe('ConfirmDialog', () => {
  it('タイトル・説明・ボタンを表示する', () => {
    render(
      <ConfirmDialog
        open={true}
        title="削除の確認"
        description="本当に削除しますか？"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    expect(screen.getByText('削除の確認')).toBeInTheDocument();
    expect(screen.getByText('本当に削除しますか？')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '削除' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'キャンセル' })).toBeInTheDocument();
  });

  it('confirmLabel・cancelLabel でボタン文言を上書きできる', () => {
    render(
      <ConfirmDialog
        open={true}
        title="脱退の確認"
        description="このグループから脱退しますか？"
        confirmLabel="脱退"
        cancelLabel="戻る"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    expect(screen.getByRole('button', { name: '脱退' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '戻る' })).toBeInTheDocument();
  });

  it('確認ボタンをクリックすると onConfirm を呼び出す', () => {
    const onConfirm = jest.fn();
    render(
      <ConfirmDialog
        open={true}
        title="削除"
        description="削除しますか？"
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '削除' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('キャンセルボタンをクリックすると onCancel を呼び出す', () => {
    const onCancel = jest.fn();
    render(
      <ConfirmDialog
        open={true}
        title="削除"
        description="削除しますか？"
        onConfirm={jest.fn()}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('open が false のときはダイアログを表示しない', () => {
    render(
      <ConfirmDialog
        open={false}
        title="削除"
        description="削除しますか？"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );

    expect(screen.queryByText('削除しますか？')).not.toBeInTheDocument();
  });
});
