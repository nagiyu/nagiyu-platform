import type { Meta, StoryObj } from '@storybook/react-vite';

import ErrorAlert from './ErrorAlert';

/**
 * `ErrorAlert` は統一されたエラー表示用の既存コンポーネント。
 *
 * 本ストーリーは Phase 0-2 で Storybook の動作を確認するためのサンプル。
 * Phase 1 以降に追加するアトミックコンポーネントの Stories はこの形式に従う。
 */
const meta: Meta<typeof ErrorAlert> = {
  title: 'Existing/ErrorAlert',
  component: ErrorAlert,
  tags: ['autodocs'],
  argTypes: {
    severity: {
      control: 'select',
      options: ['error', 'warning', 'info'],
    },
    title: { control: 'text' },
    message: { control: 'text' },
  },
};

export default meta;

type Story = StoryObj<typeof ErrorAlert>;

export const Default: Story = {
  args: {
    message: 'エラーが発生しました。もう一度お試しください。',
  },
};

export const WithTitle: Story = {
  args: {
    title: 'リクエスト失敗',
    message: 'サーバーに接続できませんでした。ネットワーク状態を確認してください。',
  },
};

export const Warning: Story = {
  args: {
    severity: 'warning',
    title: '注意',
    message: '入力された値が推奨範囲を超えています。',
  },
};

export const Info: Story = {
  args: {
    severity: 'info',
    title: 'お知らせ',
    message: 'メンテナンスのため一時的にサービスが停止します。',
  },
};
