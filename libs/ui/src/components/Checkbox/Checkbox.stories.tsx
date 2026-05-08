import type { Meta, StoryObj } from '@storybook/react-vite';
import * as React from 'react';

import Checkbox from './Checkbox';

/**
 * `Checkbox` は @nagiyu/ui のチェックボックス部品。
 *
 * - `label` を渡せば `<label>` で input と自動関連付け（a11y 必須対応）
 * - `indeterminate` で部分選択状態（DOM プロパティ + 視覚は横棒）
 * - 視覚的に隠した native `<input type="checkbox">` を CSS で再描画
 *
 * MUI への依存は内部で完全に隠蔽されている。
 */
const meta: Meta<typeof Checkbox> = {
  title: 'Atoms/Checkbox',
  component: Checkbox,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'inline-radio',
      options: ['sm', 'md', 'lg'],
    },
    checked: { control: 'boolean' },
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
    indeterminate: { control: 'boolean' },
    label: { control: 'text' },
  },
  args: {
    label: '同意します',
  },
  parameters: {
    layout: 'padded',
  },
};

export default meta;

type Story = StoryObj<typeof Checkbox>;

export const Default: Story = {};

export const Checked: Story = {
  args: { checked: true },
};

export const Indeterminate: Story = {
  args: { indeterminate: true, label: '部分選択' },
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const DisabledChecked: Story = {
  args: { disabled: true, checked: true },
};

export const Required: Story = {
  args: { required: true, label: '必須項目' },
};

export const NoLabel: Story = {
  args: { label: undefined, 'aria-label': '通知を受け取る' },
};

export const Sizes: Story = {
  argTypes: { size: { control: false } },
  render: (args) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Checkbox {...args} size="sm" label="sm" />
      <Checkbox {...args} size="md" label="md" />
      <Checkbox {...args} size="lg" label="lg" />
    </div>
  ),
};

/**
 * 制御コンポーネントの動作確認用ストーリー。
 */
export const Controlled: Story = {
  render: function ControlledRender(args) {
    const [checked, setChecked] = React.useState(false);
    return (
      <Checkbox
        {...args}
        checked={checked}
        onChange={(e) => setChecked(e.target.checked)}
        label={`チェック状態: ${checked ? 'on' : 'off'}`}
      />
    );
  },
};
