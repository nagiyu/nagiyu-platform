import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Alert, Checkbox, FormControlLabel } from '@mui/material';
import ConfirmDialog from './ConfirmDialog';

const meta: Meta<typeof ConfirmDialog> = {
  title: 'Molecules/ConfirmDialog',
  component: ConfirmDialog,
  tags: ['autodocs'],
  args: {
    open: true,
    title: '削除の確認',
    description: 'この操作は取り消せません。本当に削除しますか？',
    confirmLabel: '削除',
    cancelLabel: 'キャンセル',
    loading: false,
    onConfirm: () => {},
    onCancel: () => {},
  },
};

export default meta;

type Story = StoryObj<typeof ConfirmDialog>;

export const Default: Story = {};

export const Loading: Story = {
  args: { loading: true },
};

export const CustomLabels: Story = {
  args: {
    title: 'ログアウトの確認',
    description: 'ログアウトしてもよろしいですか？',
    confirmLabel: 'ログアウト',
    cancelLabel: '戻る',
  },
};

export const Closed: Story = {
  args: { open: false },
};

export const WithChildren: Story = {
  args: {
    title: 'アカウントの削除',
    description: '次のアカウントを削除します。',
    children: (
      <>
        <p>対象: example@example.com</p>
        <Alert severity="warning">削除したデータは復元できません。</Alert>
      </>
    ),
  },
};

export const ConfirmDisabled: Story = {
  args: { confirmDisabled: true },
  render: function Render(args) {
    const [agreed, setAgreed] = useState(false);
    return (
      <ConfirmDialog {...args} confirmDisabled={!agreed}>
        <FormControlLabel
          control={<Checkbox checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />}
          label="内容を理解しました"
        />
      </ConfirmDialog>
    );
  },
};
