import { fireEvent, render, screen } from '@testing-library/react';
import MemoryEditModal from '@/components/MemoryEditModal';
import type { MemoryListItem } from '@/lib/memory/types';

const memory: MemoryListItem = {
  id: 'enc-id',
  tier: 'B',
  category: 'food',
  content: 'コーヒーが好き',
  confidence: 0.8,
  referencedCount: 1,
  createdAt: 1,
  updatedAt: 1,
};

describe('MemoryEditModal', () => {
  it('memory の値で初期化される', () => {
    render(<MemoryEditModal open memory={memory} onSave={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByLabelText('覚えている内容')).toHaveValue('コーヒーが好き');
    expect(screen.getByLabelText('カテゴリ')).toHaveValue('food');
  });

  it('有効な編集で onSave が validated patch とともに呼ばれる', () => {
    const onSave = jest.fn();
    render(<MemoryEditModal open memory={memory} onSave={onSave} onClose={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('覚えている内容'), {
      target: { value: '紅茶が好き' },
    });
    fireEvent.click(screen.getByTestId('memory-edit-save'));

    expect(onSave).toHaveBeenCalledWith('enc-id', { content: '紅茶が好き', category: 'food' });
  });

  it('不正な category はエラー表示し onSave を呼ばない', () => {
    const onSave = jest.fn();
    render(<MemoryEditModal open memory={memory} onSave={onSave} onClose={jest.fn()} />);

    fireEvent.change(screen.getByLabelText('カテゴリ'), {
      target: { value: '日本語カテゴリ' },
    });
    fireEvent.click(screen.getByTestId('memory-edit-save'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('memory-edit-error')).toBeInTheDocument();
  });

  it('キャンセルで onClose が呼ばれる', () => {
    const onClose = jest.fn();
    render(<MemoryEditModal open memory={memory} onSave={jest.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByText('キャンセル'));
    expect(onClose).toHaveBeenCalled();
  });
});
