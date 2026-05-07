import type { Meta, StoryObj } from '@storybook/react-vite';

import Chip from './Chip';

/**
 * `Chip` は @nagiyu/ui のタグ・ステータス表示部品。
 *
 * - `variant`（solid / outline）× `color`（6 種）× `size`（sm/md/lg）の直交した API
 * - `onClick` を渡すと `<button>` として描画され、キーボード操作にも対応
 * - `asChild` で `<Link>` / `<a>` 等への変身に対応（Radix Slot パターン）
 *
 * MUI への依存は内部で完全に隠蔽されている。
 */
const meta: Meta<typeof Chip> = {
  title: 'Atoms/Chip',
  component: Chip,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['solid', 'outline'],
    },
    color: {
      control: 'select',
      options: ['primary', 'secondary', 'danger', 'success', 'warning', 'neutral'],
    },
    size: {
      control: 'inline-radio',
      options: ['sm', 'md', 'lg'],
    },
    children: { control: 'text' },
  },
  args: {
    variant: 'solid',
    color: 'neutral',
    size: 'md',
    children: 'タグ',
  },
};

export default meta;

type Story = StoryObj<typeof Chip>;

export const Default: Story = {};

export const Variants: Story = {
  argTypes: { variant: { control: false } },
  render: (args) => (
    <div style={{ display: 'flex', gap: 8 }}>
      <Chip {...args} variant="solid">
        solid
      </Chip>
      <Chip {...args} variant="outline">
        outline
      </Chip>
    </div>
  ),
};

export const Colors: Story = {
  argTypes: { color: { control: false } },
  render: (args) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {(['primary', 'secondary', 'danger', 'success', 'warning', 'neutral'] as const).map(
        (color) => (
          <Chip {...args} key={color} color={color}>
            {color}
          </Chip>
        )
      )}
    </div>
  ),
};

export const Sizes: Story = {
  argTypes: { size: { control: false } },
  render: (args) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Chip {...args} size="sm">
        sm
      </Chip>
      <Chip {...args} size="md">
        md
      </Chip>
      <Chip {...args} size="lg">
        lg
      </Chip>
    </div>
  ),
};

export const Clickable: Story = {
  args: { children: 'クリックできる', color: 'primary' },
  render: (args) => <Chip {...args} onClick={() => alert('clicked')} />,
};

export const AsChildLink: Story = {
  args: { variant: 'outline', color: 'primary' },
  render: (args) => (
    <Chip {...args} asChild>
      <a href="https://example.com" target="_blank" rel="noreferrer">
        リンクとしての Chip
      </a>
    </Chip>
  ),
};

/**
 * variant × color のマトリクス（視覚回帰テスト・カタログ用途）。
 */
export const Matrix: Story = {
  argTypes: { variant: { control: false }, color: { control: false } },
  render: () => (
    <div style={{ display: 'grid', gap: 8 }}>
      {(['solid', 'outline'] as const).map((variant) => (
        <div key={variant} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(['primary', 'secondary', 'danger', 'success', 'warning', 'neutral'] as const).map(
            (color) => (
              <Chip key={color} variant={variant} color={color}>
                {variant}/{color}
              </Chip>
            )
          )}
        </div>
      ))}
    </div>
  ),
};
