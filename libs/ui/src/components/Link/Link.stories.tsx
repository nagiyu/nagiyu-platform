import type { Meta, StoryObj } from '@storybook/react-vite';

import Link from './Link';

/**
 * `Link` は @nagiyu/ui のテキスト・リンク部品（スタイル付き `<a>`）。
 *
 * - `color`（7 種、`inherit` 含む）× `underline`（none/hover/always）の直交した API
 * - `asChild` で `next/link` の `<Link>` 等への変身に対応（Radix Slot）
 *
 * MUI への依存は内部で完全に隠蔽されている。
 */
const meta: Meta<typeof Link> = {
  title: 'Atoms/Link',
  component: Link,
  tags: ['autodocs'],
  argTypes: {
    color: {
      control: 'select',
      options: ['primary', 'secondary', 'danger', 'success', 'warning', 'neutral', 'inherit'],
    },
    underline: {
      control: 'inline-radio',
      options: ['none', 'hover', 'always'],
    },
    href: { control: 'text' },
    children: { control: 'text' },
  },
  args: {
    color: 'primary',
    underline: 'hover',
    href: 'https://example.com',
    children: 'リンクテキスト',
  },
  parameters: {
    layout: 'padded',
  },
};

export default meta;

type Story = StoryObj<typeof Link>;

export const Default: Story = {};

export const ExternalLink: Story = {
  args: {
    href: 'https://github.com/nagiyu/nagiyu-platform',
    target: '_blank',
    rel: 'noopener noreferrer',
    children: 'GitHub - nagiyu/nagiyu-platform',
  },
};

export const Colors: Story = {
  argTypes: { color: { control: false } },
  render: (args) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {(
        ['primary', 'secondary', 'danger', 'success', 'warning', 'neutral', 'inherit'] as const
      ).map((color) => (
        <Link {...args} key={color} color={color}>
          {color}
        </Link>
      ))}
    </div>
  ),
};

export const UnderlineVariants: Story = {
  argTypes: { underline: { control: false } },
  render: (args) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Link {...args} underline="none">
        underline=none
      </Link>
      <Link {...args} underline="hover">
        underline=hover
      </Link>
      <Link {...args} underline="always">
        underline=always
      </Link>
    </div>
  ),
};

/**
 * `inherit` カラー：親要素の文字色をそのまま継承する。
 * フッター・ヘッダー等のコンテクスト色が決まっている場所で使う。
 */
export const InheritColor: Story = {
  render: (args) => (
    <p style={{ color: '#7a3a3a' }}>
      暗赤色のテキスト中に{' '}
      <Link {...args} color="inherit">
        継承色のリンク
      </Link>{' '}
      を埋め込む例。
    </p>
  ),
};

export const AsChild: Story = {
  args: { color: 'primary', underline: 'always' },
  render: (args) => (
    <Link {...args} asChild>
      {/* 仮の <a> 要素を渡す。実プロジェクトでは next/link の <Link> を渡す想定。 */}
      <a href="/some/internal-route">SPA ナビゲーション用リンク（asChild）</a>
    </Link>
  ),
};
