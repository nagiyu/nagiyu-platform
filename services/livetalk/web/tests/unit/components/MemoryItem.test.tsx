import { fireEvent, render, screen } from '@testing-library/react';
import MemoryItem from '@/components/MemoryItem';
import type { MemoryListItem } from '@/lib/memory/types';

const memory: MemoryListItem = {
  id: 'enc-id',
  tier: 'B',
  category: 'food',
  content: 'コーヒーが好き',
  confidence: 0.8,
  referencedCount: 3,
  lastReferencedAt: new Date(2026, 0, 5).getTime(),
  createdAt: 1,
  updatedAt: 1,
};

describe('MemoryItem', () => {
  it('content・category・信頼度を表示する', () => {
    render(<MemoryItem memory={memory} onEdit={jest.fn()} onDelete={jest.fn()} />);
    expect(screen.getByText('コーヒーが好き')).toBeInTheDocument();
    expect(screen.getByTestId('memory-category')).toHaveTextContent('#food');
    expect(screen.getByTestId('memory-confidence')).toHaveAttribute('aria-label', '信頼度 4 / 5');
  });

  it('編集・削除ボタンがコールバックを呼ぶ', () => {
    const onEdit = jest.fn();
    const onDelete = jest.fn();
    render(<MemoryItem memory={memory} onEdit={onEdit} onDelete={onDelete} />);
    fireEvent.click(screen.getByTestId('memory-edit'));
    fireEvent.click(screen.getByTestId('memory-delete'));
    expect(onEdit).toHaveBeenCalledWith(memory);
    expect(onDelete).toHaveBeenCalledWith(memory);
  });

  it('Tier B では onPin 指定時に固定ボタンを表示', () => {
    const onPin = jest.fn();
    render(<MemoryItem memory={memory} onEdit={jest.fn()} onDelete={jest.fn()} onPin={onPin} />);
    fireEvent.click(screen.getByTestId('memory-pin'));
    expect(onPin).toHaveBeenCalledWith(memory);
  });

  it('Tier A では固定ボタンを表示しない', () => {
    const onPin = jest.fn();
    render(
      <MemoryItem
        memory={{ ...memory, tier: 'A' }}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
        onPin={onPin}
      />
    );
    expect(screen.queryByTestId('memory-pin')).not.toBeInTheDocument();
  });
});
