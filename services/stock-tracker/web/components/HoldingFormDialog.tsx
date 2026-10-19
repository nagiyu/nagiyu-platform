'use client';

import type { ReactNode } from 'react';
import {
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  // eslint-disable-next-line no-restricted-imports -- 数値入力の HTML 制約 step/min/max（slotProps.htmlInput）が必要なため、@nagiyu/ui ではなく MUI の TextField をそのまま利用する
  TextField,
} from '@mui/material';
import { Button, Select } from '@nagiyu/ui';
import { useEnterSubmit } from '@nagiyu/react';

export type HoldingFormField = 'quantity' | 'averagePrice' | 'currency';

export interface HoldingFormValues {
  quantity: string;
  averagePrice: string;
  currency: string;
}

export interface HoldingFormDialogProps {
  open: boolean;
  title: string;
  values: HoldingFormValues;
  errors: Partial<Record<HoldingFormField, string>>;
  /** 保存処理の実行中。ボタンを無効化し、閉じる操作も無視する。 */
  submitting: boolean;
  /** 取引所欄。登録時は選択、編集時は固定表示と画面ごとに異なるため呼び出し側が組み立てる。 */
  exchangeField: ReactNode;
  /** ティッカー欄。取引所欄と同じ理由で呼び出し側が組み立てる。 */
  tickerField: ReactNode;
  /** 通貨を選択可能にする。登録後は通貨を変えられないため、編集時は false。 */
  currencyEditable: boolean;
  /** 入力欄の上に出す通知 (取得エラーなど)。 */
  notice?: ReactNode;
  /** 入力欄の id 接頭辞。画面内で複数のフォームが共存するときに重複させない。 */
  idPrefix?: string;
  onChange: (field: HoldingFormField, value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

const CURRENCIES = ['USD', 'JPY', 'EUR', 'GBP'] as const;

/**
 * 保有株式の登録・編集フォームダイアログ。
 * 確認ではなく入力のダイアログのため ConfirmDialog は使わず、幅・ボタン文言・処理中の挙動のみ揃える。
 */
export default function HoldingFormDialog({
  open,
  title,
  values,
  errors,
  submitting,
  exchangeField,
  tickerField,
  currencyEditable,
  notice,
  idPrefix,
  onChange,
  onSubmit,
  onClose,
}: HoldingFormDialogProps) {
  // MUI TextField の onKeyDown は HTMLDivElement のイベントとして型付けられるため、型引数を明示する。
  // 無効入力は onSubmit 側の検証が弾くため、無効化条件は二重送信防止の submitting のみ。
  const handleEnterDown = useEnterSubmit<HTMLDivElement>(onSubmit, { disabled: submitting });

  // 処理中に閉じると進行中の保存と画面状態が食い違うため、閉じる操作を無視する。
  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const idOf = (name: string) => (idPrefix ? `${idPrefix}-${name}` : undefined);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {notice}
        <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {exchangeField}
          {tickerField}
          <TextField
            fullWidth
            id={idOf('quantity')}
            label="保有数"
            type="number"
            value={values.quantity}
            onChange={(e) => onChange('quantity', e.target.value)}
            onKeyDown={handleEnterDown}
            error={!!errors.quantity}
            helperText={errors.quantity}
            slotProps={{ htmlInput: { step: '0.0001', min: '0.0001', max: '1000000000' } }}
          />
          <TextField
            fullWidth
            id={idOf('average-price')}
            label="平均取得価格"
            type="number"
            value={values.averagePrice}
            onChange={(e) => onChange('averagePrice', e.target.value)}
            onKeyDown={handleEnterDown}
            error={!!errors.averagePrice}
            helperText={errors.averagePrice}
            slotProps={{ htmlInput: { step: '0.01', min: '0.01', max: '1000000' } }}
          />
          {currencyEditable ? (
            <Select
              fullWidth
              id={idOf('currency')}
              label="通貨"
              value={values.currency}
              onChange={(value) => onChange('currency', value)}
              error={!!errors.currency}
              helperText={errors.currency}
              options={CURRENCIES.map((currency) => ({ value: currency, label: currency }))}
            />
          ) : (
            <TextField
              fullWidth
              label="通貨"
              value={values.currency}
              disabled
              slotProps={{ input: { readOnly: true } }}
            />
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting} variant="ghost">
          キャンセル
        </Button>
        <Button onClick={onSubmit} variant="solid" color="primary" loading={submitting}>
          保存
        </Button>
      </DialogActions>
    </Dialog>
  );
}
