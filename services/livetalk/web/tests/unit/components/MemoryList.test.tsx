import { render, screen } from '@testing-library/react';
import MemoryList from '@/components/MemoryList';
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

describe('MemoryList', () => {
  it('ローディング中はスピナー', () => {
    render(<MemoryList memories={[]} loading onDelete={jest.fn()} />);
    expect(screen.getByTestId('memory-loading')).toBeInTheDocument();
  });

  it('空なら空状態メッセージ', () => {
    render(<MemoryList memories={[]} loading={false} onDelete={jest.fn()} />);
    expect(screen.getByTestId('memory-empty')).toBeInTheDocument();
  });

  it('記憶があれば一覧表示', () => {
    render(<MemoryList memories={[memory]} loading={false} onDelete={jest.fn()} />);
    expect(screen.getByTestId('memory-list')).toBeInTheDocument();
    expect(screen.getByText('コーヒーが好き')).toBeInTheDocument();
  });
});
