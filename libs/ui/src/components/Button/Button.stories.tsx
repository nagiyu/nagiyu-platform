import type { Meta, StoryObj } from '@storybook/react-vite';

import Button from './Button';

/**
 * `Button` は @nagiyu/ui の最小単位アクション部品。
 *
 * - `variant`（solid / outline / ghost）× `color`（6 種）× `size`（sm/md/lg）の直交した API
 * - `loading` でスピナー、`asChild` で `<a>` 等への変身（Radix Slot）
 *
 * MUI への依存は内部で完全に隠蔽されている（Props 型は 100% 独自）。
 */
const meta: Meta<typeof Button> = {
  title: 'Atoms/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['solid', 'outline', 'ghost'],
    },
    color: {
      control: 'select',
      options: ['primary', 'secondary', 'danger', 'success', 'warning', 'neutral'],
    },
    size: {
      control: 'inline-radio',
      options: ['sm', 'md', 'lg'],
    },
    loading: { control: 'boolean' },
    disabled: { control: 'boolean' },
    asChild: { control: 'boolean' },
    children: { control: 'text' },
  },
  args: {
    variant: 'solid',
    color: 'primary',
    size: 'md',
    children: 'ボタン',
  },
};

export default meta;

type Story = StoryObj<typeof Button>;

export const Default: Story = {};

export const Variants: Story = {
  argTypes: { variant: { control: false } },
  render: (args) => (
    <div style={{ display: 'flex', gap: 12 }}>
      <Button {...args} variant="solid">
        solid
      </Button>
      <Button {...args} variant="outline">
        outline
      </Button>
      <Button {...args} variant="ghost">
        ghost
      </Button>
    </div>
  ),
};

export const Colors: Story = {
  argTypes: { color: { control: false } },
  render: (args) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      {(['primary', 'secondary', 'danger', 'success', 'warning', 'neutral'] as const).map(
        (color) => (
          <Button {...args} key={color} color={color}>
            {color}
          </Button>
        ),
      )}
    </div>
  ),
};

export const Sizes: Story = {
  argTypes: { size: { control: false } },
  render: (args) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Button {...args} size="sm">
        sm
      </Button>
      <Button {...args} size="md">
        md
      </Button>
      <Button {...args} size="lg">
        lg
      </Button>
    </div>
  ),
};

export const Loading: Story = {
  args: { loading: true, children: '送信中' },
};

export const Disabled: Story = {
  args: { disabled: true, children: '無効' },
};

export const AsChildLink: Story = {
  args: { asChild: true, color: 'primary', variant: 'solid' },
  render: (args) => (
    <Button {...args}>
      <a href="https://example.com" target="_blank" rel="noreferrer">
        リンクとしてのボタン
      </a>
    </Button>
  ),
};

/**
 * variant × color のマトリクス（視覚回帰テスト・カタログ用途）。
 */
export const Matrix: Story = {
  argTypes: { variant: { control: false }, color: { control: false } },
  render: () => (
    <div style={{ display: 'grid', gap: 12 }}>
      {(['solid', 'outline', 'ghost'] as const).map((variant) => (
        <div key={variant} style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {(
            ['primary', 'secondary', 'danger', 'success', 'warning', 'neutral'] as const
          ).map((color) => (
            <Button key={color} variant={variant} color={color}>
              {variant}/{color}
            </Button>
          ))}
        </div>
      ))}
    </div>
  ),
};
