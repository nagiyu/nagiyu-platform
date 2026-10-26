import { fireEvent, render, screen } from '@testing-library/react';
import MemoryDeleteDialog from '@/components/MemoryDeleteDialog';
import type { SelfFactListItem } from '@/lib/memory/types';
import { getMemoryDeleteAnnotation } from '@/lib/memory/messages';

const item: SelfFactListItem = {
  id: 'enc-id',
  topicId: 't1',
  subject: '好きな食べ物',
  text: 'カレーが好き',
  createdAt: 1,
};

describe('MemoryDeleteDialog', () => {
  it('item が null のとき非表示', () => {
    render(<MemoryDeleteDialog item={null} onConfirm={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('item があるとき削除対象の text を表示', () => {
    render(<MemoryDeleteDialog item={item} onConfirm={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByText(/カレーが好き/)).toBeInTheDocument();
  });

  it('決定的削除（確実に忘れる）の注釈を表示する（既定キャラクター）', () => {
    render(<MemoryDeleteDialog item={item} onConfirm={jest.fn()} onCancel={jest.fn()} />);
    const annotation = screen.getByTestId('delete-annotation');
    expect(annotation).toBeInTheDocument();
    expect(annotation).toHaveTextContent(getMemoryDeleteAnnotation());
  });

  it('characterId に ageha を指定するとアゲハの注釈を表示する', () => {
    render(
      <MemoryDeleteDialog
        item={item}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
        characterId="ageha"
      />
    );
    const annotation = screen.getByTestId('delete-annotation');
    expect(annotation).toHaveTextContent(getMemoryDeleteAnnotation('ageha'));
    expect(annotation.textContent).toContain('アゲハ');
  });

  it('削除ボタンクリックで onConfirm を呼ぶ', () => {
    const onConfirm = jest.fn();
    render(<MemoryDeleteDialog item={item} onConfirm={onConfirm} onCancel={jest.fn()} />);
    fireEvent.click(screen.getByTestId('memory-delete-confirm'));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('キャンセルクリックで onCancel を呼ぶ', () => {
    const onCancel = jest.fn();
    render(<MemoryDeleteDialog item={item} onConfirm={jest.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('処理中は Escape で閉じない', () => {
    const onCancel = jest.fn();
    render(<MemoryDeleteDialog item={item} loading onConfirm={jest.fn()} onCancel={onCancel} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('error があるときダイアログ内に role=alert で表示する', () => {
    render(
      <MemoryDeleteDialog
        item={item}
        error="記憶の削除に失敗しました"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    const dialog = screen.getByRole('dialog');
    const error = screen.getByTestId('delete-error');
    expect(dialog).toContainElement(error);
    expect(error).toHaveAttribute('role', 'alert');
    expect(error).toHaveTextContent('記憶の削除に失敗しました');
  });

  it('error が無いときはエラー表示を出さない', () => {
    render(<MemoryDeleteDialog item={item} onConfirm={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.queryByTestId('delete-error')).not.toBeInTheDocument();
  });
});
