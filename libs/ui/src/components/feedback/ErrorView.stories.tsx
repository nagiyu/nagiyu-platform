import type { Meta, StoryObj } from '@storybook/react-vite';

import ErrorView from './ErrorView';

/**
 * `ErrorView` は画面表示中のエラー時の画面。
 *
 * 各サービスの `error.tsx` から呼び出す。`onRetry` を渡すと「もう一度試す」を表示し、
 * 渡さないときはトップへ戻るだけを強調ボタンとして表示する。
 * エラーの message / digest は表示しない。
 */
const meta: Meta<typeof ErrorView> = {
  title: 'Feedback/ErrorView',
  component: ErrorView,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  argTypes: {
    title: { control: 'text' },
    description: { control: 'text' },
    homeHref: { control: 'text' },
  },
};

export default meta;

type Story = StoryObj<typeof ErrorView>;

export const WithRetry: Story = {
  args: {
    onRetry: () => {
      // Storybook 用のサンプル
    },
  },
};

export const WithoutRetry: Story = {};

export const CustomMessage: Story = {
  args: {
    title: '読み込みに失敗しました',
    description: '時間をおいて再度お試しください。',
    onRetry: () => {
      // Storybook 用のサンプル
    },
  },
};

export const CustomHomeHref: Story = {
  args: {
    homeHref: '/articles',
  },
};
