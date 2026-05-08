import type { Meta, StoryObj } from '@storybook/react-vite';
import * as React from 'react';

import Select, { type SelectOption } from './Select';

/**
 * `Select` は @nagiyu/ui の単一選択 dropdown 部品。
 *
 * - ネイティブ `<select>` 要素ベースで ARIA / キーボード操作 / モバイル UI を OS 標準に追従
 * - `options=[{value, label}]` の設定駆動 API（MenuItem ネスト不要）
 * - `value` + `onChange(value)` の値直渡しシグネチャ
 * - `placeholder` 指定時は先頭に空 option を挿入（未選択を明示）
 * - `label` を渡せば `useId` で select と自動関連付け（a11y 必須対応）
 *
 * MUI / Radix への依存は内部で完全に隠蔽されている。
 */
const meta: Meta<typeof Select> = {
  title: 'Atoms/Select',
  component: Select,
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'inline-radio',
      options: ['sm', 'md', 'lg'],
    },
    fullWidth: { control: 'boolean' },
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
    error: { control: 'boolean' },
    label: { control: 'text' },
    placeholder: { control: 'text' },
    helperText: { control: 'text' },
  },
  parameters: {
    layout: 'padded',
  },
};

export default meta;

type Story = StoryObj<typeof Select>;

const PERIOD_OPTIONS: ReadonlyArray<SelectOption> = [
  { value: '24h', label: '直近 24 時間' },
  { value: '7d', label: '直近 7 日' },
  { value: '30d', label: '直近 30 日' },
  { value: 'all', label: '指定なし' },
];

const COUNTRY_OPTIONS: ReadonlyArray<SelectOption> = [
  { value: 'jp', label: '日本' },
  { value: 'us', label: 'アメリカ' },
  { value: 'gb', label: 'イギリス' },
  { value: 'de', label: 'ドイツ', disabled: true },
];

const ControlledSelect = (args: React.ComponentProps<typeof Select>) => {
  const [value, setValue] = React.useState(args.value);
  return <Select {...args} value={value} onChange={setValue} />;
};

export const Default: Story = {
  render: ControlledSelect,
  args: {
    label: '期間',
    value: '24h',
    options: PERIOD_OPTIONS,
  },
};

export const WithPlaceholder: Story = {
  render: ControlledSelect,
  args: {
    label: '国',
    value: '',
    placeholder: '選択してください',
    options: COUNTRY_OPTIONS,
  },
};

export const WithHelperText: Story = {
  render: ControlledSelect,
  args: {
    label: '期間',
    value: '24h',
    options: PERIOD_OPTIONS,
    helperText: '集計対象とする期間を選択します',
  },
};

export const Required: Story = {
  render: ControlledSelect,
  args: {
    label: '国',
    value: '',
    placeholder: '選択してください',
    required: true,
    options: COUNTRY_OPTIONS,
  },
};

export const Error: Story = {
  render: ControlledSelect,
  args: {
    label: '国',
    value: '',
    placeholder: '選択してください',
    error: true,
    helperText: '必須項目です',
    options: COUNTRY_OPTIONS,
  },
};

export const Disabled: Story = {
  args: {
    label: '期間',
    value: '24h',
    disabled: true,
    options: PERIOD_OPTIONS,
    onChange: () => undefined,
  },
};

export const DisabledOption: Story = {
  render: ControlledSelect,
  args: {
    label: '国',
    value: 'jp',
    options: COUNTRY_OPTIONS,
    helperText: 'ドイツは現在受付停止中（option.disabled）',
  },
};

export const FullWidth: Story = {
  render: ControlledSelect,
  args: {
    label: '期間',
    value: '24h',
    fullWidth: true,
    options: PERIOD_OPTIONS,
  },
};

export const Sizes: Story = {
  argTypes: { size: { control: false } },
  render: (args) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: 320 }}>
      <ControlledSelect {...args} size="sm" label="sm" />
      <ControlledSelect {...args} size="md" label="md" />
      <ControlledSelect {...args} size="lg" label="lg" />
    </div>
  ),
  args: {
    value: '24h',
    options: PERIOD_OPTIONS,
  },
};
