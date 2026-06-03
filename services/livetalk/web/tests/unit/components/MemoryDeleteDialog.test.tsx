import { fireEvent, render, screen } from '@testing-library/react';
import MemoryDeleteDialog from '@/components/MemoryDeleteDialog';
import type { MemoryListItem } from '@/lib/memory/types';
import { MEMORY_DELETE_ANNOTATION } from '@/lib/memory/messages';

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

describe('MemoryDeleteDialog', () => {
  it('memory が null のとき非表示', () => {
    render(<MemoryDeleteDialog memory={null} onConfirm={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('memory があるとき削除対象の content を表示', () => {
    render(<MemoryDeleteDialog memory={memory} onConfirm={jest.fn()} onCancel={jest.fn()} />);
    expect(screen.getByText(/コーヒーが好き/)).toBeInTheDocument();
  });

  it('即時反映されない旨の注釈を表示する', () => {
    render(<MemoryDeleteDialog memory={memory} onConfirm={jest.fn()} onCancel={jest.fn()} />);
    const annotation = screen.getByTestId('delete-annotation');
    expect(annotation).toBeInTheDocument();
    expect(annotation).toHaveTextContent(MEMORY_DELETE_ANNOTATION);
  });

  it('削除ボタンクリックで onConfirm を呼ぶ', () => {
    const onConfirm = jest.fn();
    render(<MemoryDeleteDialog memory={memory} onConfirm={onConfirm} onCancel={jest.fn()} />);
    fireEvent.click(screen.getByTestId('memory-delete-confirm'));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('やめるクリックで onCancel を呼ぶ', () => {
    const onCancel = jest.fn();
    render(<MemoryDeleteDialog memory={memory} onConfirm={jest.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'やめる' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
