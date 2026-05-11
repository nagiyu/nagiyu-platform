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

export const WithRetry: Story = {
  args: {
    message: 'データの取得に失敗しました。',
    onRetry: () => {
      // Storybook 用のサンプル
    },
  },
};

export const WithDetails: Story = {
  args: {
    title: '入力エラー',
    message: '以下の項目を確認してください。',
    details: ['名前を入力してください', 'メールアドレス形式が不正です'],
  },
};

export const WithClose: Story = {
  args: {
    message: '閉じるボタン付きのアラートです。',
    onClose: () => {
      // Storybook 用のサンプル
    },
  },
};

export const FromError: Story = {
  args: {
    error: new Error('Error オブジェクトから自動でメッセージを抽出します。'),
  },
};

export const FromAPIError: Story = {
  args: {
    error: Object.assign(new Error('生メッセージ'), {
      errorInfo: {
        message: 'リクエストの検証に失敗しました',
        details: ['name は必須です', 'email は形式が不正です'],
        shouldRetry: false,
      },
    }) as Error,
    onRetry: () => {
      // shouldRetry: false のためボタンは表示されない
    },
  },
};
