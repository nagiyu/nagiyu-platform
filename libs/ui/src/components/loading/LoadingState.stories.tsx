import type { Meta, StoryObj } from '@storybook/react-vite';
import { Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';

import LoadingState from './LoadingState';

/**
 * `LoadingState` は @nagiyu/ui の読み込み中表示部品。
 *
 * - `page`: 画面全体の読み込み。中央寄せでメッセージをテキスト表示する
 * - `inline`: 一覧や表の中に置く読み込み。高さを固定せず、メッセージは読み上げ専用
 */
const meta: Meta<typeof LoadingState> = {
  title: 'Atoms/LoadingState',
  component: LoadingState,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['page', 'inline'],
    },
    message: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof LoadingState>;

export const Page: Story = {};

export const PageWithMessage: Story = {
  args: { variant: 'page', message: 'データを取得しています' },
};

export const Inline: Story = {
  args: { variant: 'inline' },
};

export const InlineInTable: Story = {
  render: () => (
    <Table>
      <TableHead>
        <TableRow>
          <TableCell>名前</TableCell>
          <TableCell>状態</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        <TableRow>
          <TableCell colSpan={2}>
            <LoadingState variant="inline" message="一覧を読み込んでいます" />
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};
