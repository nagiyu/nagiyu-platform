import { fireEvent, render, screen } from '@testing-library/react';
import MemoryItem from '@/components/MemoryItem';
import type { SelfFactListItem } from '@/lib/memory/types';

const item: SelfFactListItem = {
  id: 'enc-id',
  topicId: 't1',
  subject: '好きな食べ物',
  text: 'カレーが好き',
  createdAt: 1,
};

describe('MemoryItem', () => {
  it('text を表示する', () => {
    render(<MemoryItem item={item} onDelete={jest.fn()} />);
    expect(screen.getByText('カレーが好き')).toBeInTheDocument();
  });

  it('削除ボタンがコールバックを呼ぶ', () => {
    const onDelete = jest.fn();
    render(<MemoryItem item={item} onDelete={onDelete} />);
    fireEvent.click(screen.getByTestId('memory-delete'));
    expect(onDelete).toHaveBeenCalledWith(item);
  });

  it('編集ボタンが存在しない', () => {
    render(<MemoryItem item={item} onDelete={jest.fn()} />);
    expect(screen.queryByTestId('memory-edit')).not.toBeInTheDocument();
  });

  it('固定（pin）ボタンが存在しない', () => {
    render(<MemoryItem item={item} onDelete={jest.fn()} />);
    expect(screen.queryByTestId('memory-pin')).not.toBeInTheDocument();
  });

  it('confidence 表示が存在しない', () => {
    render(<MemoryItem item={item} onDelete={jest.fn()} />);
    expect(screen.queryByTestId('memory-confidence')).not.toBeInTheDocument();
  });
});
