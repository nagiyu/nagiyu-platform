import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import GroupDetailPage from '@/app/groups/[groupId]/page';

describe('GroupDetailPage', () => {
  it('モックのメンバー一覧・共有リスト一覧・招待フォームを表示する', async () => {
    render(await GroupDetailPage({ params: Promise.resolve({ groupId: 'mock-group-1' }) }));

    expect(screen.getByRole('heading', { name: 'グループ詳細（モック）' })).toBeInTheDocument();
    expect(screen.getByText('グループID: mock-group-1')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'メンバー一覧' })).toBeInTheDocument();
    expect(screen.getByText('なぎゆ')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '共有リスト一覧' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '買い物リスト（共有）' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'メンバー招待フォーム' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'メールアドレス' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '招待を送信（モック）' })).toBeInTheDocument();
  });
});
