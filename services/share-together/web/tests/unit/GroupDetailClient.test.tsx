import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { GroupDetailClient } from '@/components/GroupDetailClient';

const MOCK_MEMBERS = [
  { userId: 'user-owner', name: 'なぎゆ' },
  { userId: 'user-member-1', name: 'さくら' },
  { userId: 'user-member-2', name: 'たろう' },
];

describe('GroupDetailClient', () => {
  it('メンバー一覧・招待フォームを表示する', () => {
    render(
      <GroupDetailClient
        groupId="mock-family-group"
        isOwner={true}
        currentUserId="user-owner"
        members={MOCK_MEMBERS}
      />
    );

    expect(screen.getByRole('heading', { name: 'メンバー一覧' })).toBeInTheDocument();
    expect(screen.getByText('なぎゆ')).toBeInTheDocument();
    expect(screen.getByText('さくら')).toBeInTheDocument();
    expect(screen.getByText('たろう')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'メンバー招待フォーム' })).toBeInTheDocument();
  });

  it('オーナーは自分以外のメンバーに削除ボタンを表示する', () => {
    render(
      <GroupDetailClient
        groupId="mock-family-group"
        isOwner={true}
        currentUserId="user-owner"
        members={MOCK_MEMBERS}
      />
    );

    expect(screen.getByRole('button', { name: 'さくらを削除' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'たろうを削除' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'なぎゆを削除' })).not.toBeInTheDocument();
  });

  it('オーナーはグループ削除ボタンを表示し、非オーナーは脱退ボタンを表示する', () => {
    const { rerender } = render(
      <GroupDetailClient
        groupId="mock-family-group"
        isOwner={true}
        currentUserId="user-owner"
        members={MOCK_MEMBERS}
      />
    );
    expect(screen.getByRole('button', { name: 'グループを削除' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'グループを脱退' })).not.toBeInTheDocument();

    rerender(
      <GroupDetailClient
        groupId="mock-roommate-group"
        isOwner={false}
        currentUserId="user-owner"
        members={MOCK_MEMBERS}
      />
    );
    expect(screen.getByRole('button', { name: 'グループを脱退' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'グループを削除' })).not.toBeInTheDocument();
  });

  it('非オーナーはメンバー削除ボタンを表示しない', () => {
    render(
      <GroupDetailClient
        groupId="mock-roommate-group"
        isOwner={false}
        currentUserId="user-owner"
        members={MOCK_MEMBERS}
      />
    );

    expect(screen.queryByRole('button', { name: 'さくらを削除' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'たろうを削除' })).not.toBeInTheDocument();
  });

  it('メンバー削除ボタンをクリックすると確認ダイアログを表示する', () => {
    render(
      <GroupDetailClient
        groupId="mock-family-group"
        isOwner={true}
        currentUserId="user-owner"
        members={MOCK_MEMBERS}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'さくらを削除' }));
    expect(screen.getByText('メンバーを削除')).toBeInTheDocument();
    expect(screen.getByText('さくらさんをグループから削除しますか？')).toBeInTheDocument();
  });

  it('メンバー削除を確認するとメンバーが削除される', () => {
    render(
      <GroupDetailClient
        groupId="mock-family-group"
        isOwner={true}
        currentUserId="user-owner"
        members={MOCK_MEMBERS}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'さくらを削除' }));
    fireEvent.click(screen.getByRole('button', { name: '削除' }));

    expect(screen.queryByText('さくら')).not.toBeInTheDocument();
    expect(screen.getByText('なぎゆ')).toBeInTheDocument();
    expect(screen.getByText('たろう')).toBeInTheDocument();
  });

  it('メンバー削除をキャンセルするとメンバーが残る', () => {
    render(
      <GroupDetailClient
        groupId="mock-family-group"
        isOwner={true}
        currentUserId="user-owner"
        members={MOCK_MEMBERS}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'さくらを削除' }));
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(screen.getByText('さくら')).toBeInTheDocument();
  });

  it('グループ削除を確認すると削除済みメッセージを表示する', () => {
    render(
      <GroupDetailClient
        groupId="mock-family-group"
        isOwner={true}
        currentUserId="user-owner"
        members={MOCK_MEMBERS}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'グループを削除' }));
    expect(
      screen.getByText('このグループを削除しますか？この操作は元に戻せません。')
    ).toBeInTheDocument();

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '削除' }));
    expect(screen.getByText('グループを削除しました（モック）。')).toBeInTheDocument();
  });

  it('グループ脱退を確認すると脱退済みメッセージを表示する', () => {
    render(
      <GroupDetailClient
        groupId="mock-roommate-group"
        isOwner={false}
        currentUserId="user-owner"
        members={MOCK_MEMBERS}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'グループを脱退' }));
    expect(screen.getByText('このグループから脱退しますか？')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '脱退' }));
    expect(screen.getByText('グループから脱退しました（モック）。')).toBeInTheDocument();
  });
});
