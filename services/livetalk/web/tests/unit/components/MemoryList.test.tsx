import { render, screen } from '@testing-library/react';
import MemoryList from '@/components/MemoryList';
import type { SelfFactListItem } from '@/lib/memory/types';

const item: SelfFactListItem = {
  id: 'enc-id',
  topicId: 't1',
  subject: '好きな食べ物',
  text: 'カレーが好き',
  createdAt: 1,
};

const item2: SelfFactListItem = {
  id: 'enc-id-2',
  topicId: 't1',
  subject: '好きな食べ物',
  text: 'ラーメンも好き',
  createdAt: 2,
};

const itemOtherTopic: SelfFactListItem = {
  id: 'enc-id-3',
  topicId: 't2',
  subject: '仕事',
  text: 'エンジニア',
  createdAt: 3,
};

describe('MemoryList', () => {
  it('ローディング中はスピナー', () => {
    render(<MemoryList items={[]} loading onDelete={jest.fn()} />);
    expect(screen.getByTestId('memory-loading')).toBeInTheDocument();
  });

  it('空なら空状態メッセージ', () => {
    render(<MemoryList items={[]} loading={false} onDelete={jest.fn()} />);
    expect(screen.getByTestId('memory-empty')).toBeInTheDocument();
  });

  it('記憶があれば一覧表示', () => {
    render(<MemoryList items={[item]} loading={false} onDelete={jest.fn()} />);
    expect(screen.getByTestId('memory-list')).toBeInTheDocument();
    expect(screen.getByText('カレーが好き')).toBeInTheDocument();
  });

  it('同じ Topic の SELF fact は 1 グループにまとまる', () => {
    render(<MemoryList items={[item, item2]} loading={false} onDelete={jest.fn()} />);
    expect(screen.getAllByTestId('memory-topic-group')).toHaveLength(1);
    expect(screen.getByText('カレーが好き')).toBeInTheDocument();
    expect(screen.getByText('ラーメンも好き')).toBeInTheDocument();
  });

  it('異なる Topic は別グループとして subject 見出しつきで表示する', () => {
    render(<MemoryList items={[item, itemOtherTopic]} loading={false} onDelete={jest.fn()} />);
    const groups = screen.getAllByTestId('memory-topic-group');
    expect(groups).toHaveLength(2);
    const subjects = screen.getAllByTestId('memory-topic-subject').map((el) => el.textContent);
    expect(subjects).toEqual(['好きな食べ物', '仕事']);
  });
});
