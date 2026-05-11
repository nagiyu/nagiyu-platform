import type { Meta, StoryObj } from '@storybook/react-vite';

import TextField from './TextField';

/**
 * `TextField` は @nagiyu/ui のテキスト入力部品。
 *
 * - `label` を渡せば `useId` で input と自動関連付け（a11y 必須対応）
 * - `multiline` で textarea に切替
 * - `error` で危険色の境界線・helperText、`aria-invalid` 自動付与
 * - `readOnly` / `maxLength` を top-level Props として提供
 *
 * MUI への依存は内部で完全に隠蔽されている。
 */
const meta: Meta<typeof TextField> = {
  title: 'Atoms/TextField',
  component: TextField,
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: 'select',
      options: ['text', 'password', 'email', 'number', 'search', 'tel', 'url'],
    },
    size: {
      control: 'inline-radio',
      options: ['sm', 'md', 'lg'],
    },
    fullWidth: { control: 'boolean' },
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
    readOnly: { control: 'boolean' },
    error: { control: 'boolean' },
    multiline: { control: 'boolean' },
    label: { control: 'text' },
    placeholder: { control: 'text' },
    helperText: { control: 'text' },
  },
  args: {
    label: '名前',
    placeholder: '山田 太郎',
  },
  parameters: {
    layout: 'padded',
  },
};

export default meta;

type Story = StoryObj<typeof TextField>;

export const Default: Story = {};

export const WithHelperText: Story = {
  args: {
    label: 'メールアドレス',
    placeholder: 'example@nagiyu.com',
    helperText: '通知の送信先として使われます',
    type: 'email',
  },
};

export const Required: Story = {
  args: {
    label: 'パスワード',
    type: 'password',
    required: true,
    helperText: '8 文字以上',
  },
};

export const Error: Story = {
  args: {
    label: 'メールアドレス',
    value: 'invalid',
    error: true,
    helperText: 'メールアドレスの形式が正しくありません',
  },
};

export const Disabled: Story = {
  args: { label: '取引所', value: 'NASDAQ', disabled: true },
};

export const ReadOnly: Story = {
  args: { label: 'ティッカー', value: 'AAPL', readOnly: true },
};

export const FullWidth: Story = {
  args: { label: '備考', fullWidth: true, placeholder: '何か入力してください' },
};

export const Sizes: Story = {
  argTypes: { size: { control: false } },
  render: (args) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: 320 }}>
      <TextField {...args} size="sm" label="sm" />
      <TextField {...args} size="md" label="md" />
      <TextField {...args} size="lg" label="lg" />
    </div>
  ),
};

export const Multiline: Story = {
  args: {
    label: 'コメント',
    multiline: true,
    minRows: 3,
    placeholder: 'コメントを入力',
    fullWidth: true,
  },
};

export const Number: Story = {
  args: {
    label: '数量',
    type: 'number',
    placeholder: '0',
    helperText: '半角数字のみ',
  },
};

export const MaxLength: Story = {
  args: {
    label: '通知タイトル',
    maxLength: 12,
    helperText: '最大 12 文字',
    fullWidth: true,
  },
};
