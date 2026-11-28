import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InviteForm } from '@/components/InviteForm';

const originalFetch = global.fetch;

describe('InviteForm', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('オーナーの場合は入力フォームを有効化し説明文を表示する', () => {
    render(
      <InviteForm
        groupId="group-1"
        isOwner={true}
        memberCount={1}
        pendingInvitationCount={0}
        onInvited={jest.fn()}
      />
    );

    expect(screen.getByText('オーナーとしてメンバーを招待できます。')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'メールアドレス' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: '招待を送信' })).not.toBeDisabled();
  });

  it('非オーナーの場合は入力フォームを無効化する', () => {
    render(
      <InviteForm
        groupId="group-1"
        isOwner={false}
        memberCount={1}
        pendingInvitationCount={0}
        onInvited={jest.fn()}
      />
    );

    expect(
      screen.getByText('このグループではメンバー追加はできません（オーナーのみ）。')
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'メールアドレス' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '招待を送信' })).toBeDisabled();
  });

  it('有効なメールアドレスを入力して送信すると API を呼び出して完了メッセージを表示する', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    } as Response);
    render(
      <InviteForm
        groupId="group-1"
        isOwner={true}
        memberCount={1}
        pendingInvitationCount={0}
        onInvited={jest.fn()}
      />
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'メールアドレス' }), {
      target: { value: 'test@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '招待を送信' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/groups/group-1/members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: 'test@example.com' }),
      });
    });
    expect(screen.getByText('招待を送信しました。')).toBeInTheDocument();
  });

  it('空のメールアドレスで送信すると完了メッセージを表示しない', () => {
    global.fetch = jest.fn();
    render(
      <InviteForm
        groupId="group-1"
        isOwner={true}
        memberCount={1}
        pendingInvitationCount={0}
        onInvited={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '招待を送信' }));

    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.queryByText('招待を送信しました。')).not.toBeInTheDocument();
  });

  it('形式が不正なメールアドレスで送信すると形式エラーを表示し、入力を直すと消える', () => {
    global.fetch = jest.fn();
    render(
      <InviteForm
        groupId="group-1"
        isOwner={true}
        memberCount={1}
        pendingInvitationCount={0}
        onInvited={jest.fn()}
      />
    );

    const input = screen.getByRole('textbox', { name: 'メールアドレス' });
    fireEvent.change(input, { target: { value: 'invalid-email' } });
    fireEvent.click(screen.getByRole('button', { name: '招待を送信' }));

    expect(screen.getByText('メールアドレスの形式が正しくありません')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'valid@example.com' } });
    expect(screen.queryByText('メールアドレスの形式が正しくありません')).not.toBeInTheDocument();
  });

  it('存在しないユーザーの場合は API の文言をそのまま表示する', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: 'USER_NOT_FOUND',
        message: 'このメールアドレスのユーザーは登録されていません',
      }),
    } as Response);
    render(
      <InviteForm
        groupId="group-1"
        isOwner={true}
        memberCount={1}
        pendingInvitationCount={0}
        onInvited={jest.fn()}
      />
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'メールアドレス' }), {
      target: { value: 'unknown@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '招待を送信' }));

    expect(
      await screen.findByText('このメールアドレスのユーザーは登録されていません')
    ).toBeInTheDocument();
  });

  it('無効なメールアドレスで送信すると完了メッセージを表示しない', () => {
    global.fetch = jest.fn();
    render(
      <InviteForm
        groupId="group-1"
        isOwner={true}
        memberCount={1}
        pendingInvitationCount={0}
        onInvited={jest.fn()}
      />
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'メールアドレス' }), {
      target: { value: 'invalid-email' },
    });
    fireEvent.click(screen.getByRole('button', { name: '招待を送信' }));

    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.queryByText('招待を送信しました。')).not.toBeInTheDocument();
  });

  it('送信後にメールアドレスを変更すると完了メッセージが消える', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    } as Response);
    render(
      <InviteForm
        groupId="group-1"
        isOwner={true}
        memberCount={1}
        pendingInvitationCount={0}
        onInvited={jest.fn()}
      />
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'メールアドレス' }), {
      target: { value: 'test@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '招待を送信' }));
    await waitFor(() => {
      expect(screen.getByText('招待を送信しました。')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole('textbox', { name: 'メールアドレス' }), {
      target: { value: 'another@example.com' },
    });
    expect(screen.queryByText('招待を送信しました。')).not.toBeInTheDocument();
  });

  it('API がエラーを返した場合はエラーメッセージを表示する', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'ALREADY_INVITED', message: '既に招待済みです' }),
    } as Response);
    render(
      <InviteForm
        groupId="group-1"
        isOwner={true}
        memberCount={1}
        pendingInvitationCount={0}
        onInvited={jest.fn()}
      />
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'メールアドレス' }), {
      target: { value: 'test@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '招待を送信' }));

    await waitFor(() => {
      expect(screen.getByText('既に招待済みです')).toBeInTheDocument();
    });
    expect(screen.queryByText('招待を送信しました。')).not.toBeInTheDocument();
  });

  it('ネットワークエラー時は汎用エラーメッセージを表示する', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network error'));
    render(
      <InviteForm
        groupId="group-1"
        isOwner={true}
        memberCount={1}
        pendingInvitationCount={0}
        onInvited={jest.fn()}
      />
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'メールアドレス' }), {
      target: { value: 'test@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: '招待を送信' }));

    await waitFor(() => {
      expect(screen.getByText('招待の送信に失敗しました。')).toBeInTheDocument();
    });
    expect(screen.queryByText('招待を送信しました。')).not.toBeInTheDocument();
  });

  it('メンバー数が上限のときは招待を無効化して上限メッセージを表示する', () => {
    global.fetch = jest.fn();
    render(
      <InviteForm
        groupId="group-1"
        isOwner={true}
        memberCount={5}
        pendingInvitationCount={0}
        onInvited={jest.fn()}
      />
    );

    expect(screen.getByText('グループメンバーは最大5名です')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'メールアドレス' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '招待を送信' })).toBeDisabled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('有効なメールアドレスを入力してエンターキーを押すと API を呼び出して完了メッセージを表示する', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    } as Response);
    render(
      <InviteForm
        groupId="group-1"
        isOwner={true}
        memberCount={1}
        pendingInvitationCount={0}
        onInvited={jest.fn()}
      />
    );

    const input = screen.getByRole('textbox', { name: 'メールアドレス' });
    fireEvent.change(input, { target: { value: 'enter@example.com' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/groups/group-1/members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: 'enter@example.com' }),
      });
    });
    expect(screen.getByText('招待を送信しました。')).toBeInTheDocument();
  });

  it('メールアドレスが空のときはエンターキーを押しても API を呼び出さない', () => {
    global.fetch = jest.fn();
    render(
      <InviteForm
        groupId="group-1"
        isOwner={true}
        memberCount={1}
        pendingInvitationCount={0}
        onInvited={jest.fn()}
      />
    );

    const input = screen.getByRole('textbox', { name: 'メールアドレス' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('承認済みと招待中の合計が上限のときは招待を無効化して上限メッセージを表示する', () => {
    global.fetch = jest.fn();
    render(
      <InviteForm
        groupId="group-1"
        isOwner={true}
        memberCount={3}
        pendingInvitationCount={2}
        onInvited={jest.fn()}
      />
    );

    expect(screen.getByText('グループメンバーは最大5名です')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'メールアドレス' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '招待を送信' })).toBeDisabled();
  });

  it('承認済みと招待中の合計が上限未満なら招待できる', () => {
    render(
      <InviteForm
        groupId="group-1"
        isOwner={true}
        memberCount={3}
        pendingInvitationCount={1}
        onInvited={jest.fn()}
      />
    );

    expect(screen.queryByText('グループメンバーは最大5名です')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '招待を送信' })).not.toBeDisabled();
  });

  it('招待の送信に成功したときだけ onInvited を呼ぶ', async () => {
    const onInvited = jest.fn();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({ message: '失敗' }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: {} }) } as Response);
    render(
      <InviteForm
        groupId="group-1"
        isOwner={true}
        memberCount={1}
        pendingInvitationCount={0}
        onInvited={onInvited}
      />
    );

    const input = screen.getByRole('textbox', { name: 'メールアドレス' });
    fireEvent.change(input, { target: { value: 'a@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '招待を送信' }));
    await screen.findByText('失敗');
    expect(onInvited).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'b@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '招待を送信' }));
    await screen.findByText('招待を送信しました。');
    expect(onInvited).toHaveBeenCalledTimes(1);
  });
});
