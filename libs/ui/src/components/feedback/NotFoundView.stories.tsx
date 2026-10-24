import type { Meta, StoryObj } from '@storybook/react-vite';

import NotFoundView from './NotFoundView';

/**
 * `NotFoundView` は 404 (ページが見つからない) 時の画面。
 *
 * 各サービスの `not-found.tsx` から呼び出す。トップへ戻る導線は素の `<a>` で描かれる。
 */
const meta: Meta<typeof NotFoundView> = {
  title: 'Feedback/NotFoundView',
  component: NotFoundView,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  argTypes: {
    title: { control: 'text' },
    description: { control: 'text' },
    homeHref: { control: 'text' },
  },
};

export default meta;

type Story = StoryObj<typeof NotFoundView>;

export const Default: Story = {};

export const CustomMessage: Story = {
  args: {
    title: '記事が見つかりません',
    description: '指定された記事は公開が終了したか、存在しません。',
  },
};

export const CustomHomeHref: Story = {
  args: {
    homeHref: '/articles',
  },
};
