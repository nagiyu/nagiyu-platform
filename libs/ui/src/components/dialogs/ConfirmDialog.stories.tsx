import type { Meta, StoryObj } from '@storybook/react-vite';
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
