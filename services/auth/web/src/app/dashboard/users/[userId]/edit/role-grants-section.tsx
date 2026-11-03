'use client';

import { useState } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { Button, Chip, ErrorAlert, Select, TextField } from '@nagiyu/ui';
import { VALID_ROLES } from '@nagiyu/common';
import type { RoleGrant, RoleGrantSource, RoleGrantStatus } from '@nagiyu/common';
import { getRoleName } from '@/lib/role-display';
import {
  GRANT_NOTE_MAX_LENGTH,
  addPendingGrant,
  addPendingRevoke,
  buildGrantRows,
  expiresAtToJstDate,
  getCurrentTimeMs,
  getTodayJstDate,
  removePendingAdd,
  setPendingExtend,
  undoPendingForGrant,
  type GrantRow,
  type PendingGrantChanges,
} from '@/lib/role-grant-editing';

const LABELS = {
  TITLE: '課金の権利',
  EMPTY: '課金の権利はありません',
  SOURCE: { manual: '手動', stripe: 'Stripe' } satisfies Record<RoleGrantSource, string>,
  STATUS: { active: '有効', expired: '期限切れ', revoked: '取り消し' } satisfies Record<
    RoleGrantStatus,
    string
  >,
  PENDING: { add: '追加予定', extend: '期限変更予定', revoke: '取り消し予定' },
  NO_EXPIRY: 'なし',
} as const;

const STATUS_COLOR = { active: 'success', expired: 'warning', revoked: 'neutral' } as const;

const NO_WRAP_CELL_SX = { whiteSpace: 'nowrap' } as const;

// 日付入力は共通部品の TextField が type="date" を持たないため、ネイティブの input を使う
const DATE_INPUT_STYLE = {
  font: 'inherit',
  padding: '6px 8px',
  border: '1px solid currentColor',
  borderRadius: 4,
  background: 'transparent',
  color: 'inherit',
} as const;

const ROLE_OPTIONS = VALID_ROLES.map((role) => ({ value: role, label: getRoleName(role) }));

interface RoleGrantsSectionProps {
  grants: readonly RoleGrant[];
  pending: PendingGrantChanges;
  onPendingChange: (next: PendingGrantChanges) => void;
  disabled: boolean;
}

function DateInput({
  label,
  value,
  min,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  min: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <input
      type="date"
      aria-label={label}
      value={value}
      min={min}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      style={DATE_INPUT_STYLE}
    />
  );
}

/**
 * ユーザー編集画面の「課金の権利」欄。
 *
 * 変更はその場で送らず、`pending` (保存前の変更) として親に返す。送信は親の「保存」が行う。
 */
export function RoleGrantsSection({
  grants,
  pending,
  onPendingChange,
  disabled,
}: RoleGrantsSectionProps) {
  const [editingGrantId, setEditingGrantId] = useState<string | null>(null);
  const [editingDate, setEditingDate] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [addRoleId, setAddRoleId] = useState('');
  const [addDate, setAddDate] = useState('');
  const [addNote, setAddNote] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [nextKey, setNextKey] = useState(0);

  // 描画中に現在時刻を読まないよう、表示用は state に持ち、操作のたびに更新する
  const [renderedAt, setRenderedAt] = useState(() => getCurrentTimeMs());
  const now = renderedAt;
  const minDate = getTodayJstDate(now);
  const rows = buildGrantRows(grants, pending, now);

  const startEdit = (row: GrantRow) => {
    setEditingGrantId(row.grantId ?? null);
    setEditingDate(row.expiresAt !== undefined ? expiresAtToJstDate(row.expiresAt) : '');
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingGrantId(null);
    setEditError(null);
  };

  const confirmEdit = (grant: RoleGrant) => {
    const operatedAt = getCurrentTimeMs();
    setRenderedAt(operatedAt);
    const result = setPendingExtend(pending, grant, editingDate, operatedAt);
    if (!result.ok) {
      setEditError(result.error);
      return;
    }
    onPendingChange(result.pending);
    cancelEdit();
  };

  const handleAdd = () => {
    const operatedAt = getCurrentTimeMs();
    setRenderedAt(operatedAt);
    const result = addPendingGrant(
      pending,
      { key: String(nextKey), roleId: addRoleId, date: addDate, sourceRef: addNote },
      operatedAt
    );
    if (!result.ok) {
      setAddError(result.error);
      return;
    }
    onPendingChange(result.pending);
    setNextKey(nextKey + 1);
    setAddRoleId('');
    setAddDate('');
    setAddNote('');
    setAddError(null);
  };

  const renderOperations = (row: GrantRow) => {
    if (row.pending !== null) {
      const undo = () =>
        onPendingChange(
          row.addKey !== undefined
            ? removePendingAdd(pending, row.addKey)
            : undoPendingForGrant(pending, row.grantId as string)
        );
      return (
        <Button variant="outline" size="sm" onClick={undo} disabled={disabled}>
          元に戻す
        </Button>
      );
    }
    if (!row.operable || row.grantId === undefined) {
      return null;
    }
    const grant = grants.find((g) => g.grantId === row.grantId) as RoleGrant;
    if (editingGrantId === row.grantId) {
      return (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <DateInput
            label="新しい期限"
            value={editingDate}
            min={minDate}
            onChange={setEditingDate}
            disabled={disabled}
          />
          <Button size="sm" onClick={() => confirmEdit(grant)} disabled={disabled}>
            決定
          </Button>
          <Button variant="outline" size="sm" onClick={cancelEdit} disabled={disabled}>
            やめる
          </Button>
          {editError && (
            <Typography variant="caption" color="error" role="alert" sx={{ width: '100%' }}>
              {editError}
            </Typography>
          )}
        </Box>
      );
    }
    return (
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button variant="outline" size="sm" onClick={() => startEdit(row)} disabled={disabled}>
          期限の変更
        </Button>
        <Button
          variant="outline"
          color="danger"
          size="sm"
          onClick={() => onPendingChange(addPendingRevoke(pending, row.grantId as string))}
          disabled={disabled}
        >
          取り消し
        </Button>
      </Box>
    );
  };

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h6" gutterBottom>
        {LABELS.TITLE}
      </Typography>

      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {LABELS.EMPTY}
        </Typography>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={NO_WRAP_CELL_SX}>ロール</TableCell>
                <TableCell sx={NO_WRAP_CELL_SX}>出どころ</TableCell>
                <TableCell sx={NO_WRAP_CELL_SX}>有効期限</TableCell>
                <TableCell sx={NO_WRAP_CELL_SX}>状態</TableCell>
                <TableCell sx={NO_WRAP_CELL_SX}>メモ</TableCell>
                <TableCell sx={NO_WRAP_CELL_SX}>操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.rowKey} data-testid="grant-row">
                  <TableCell>{getRoleName(row.roleId)}</TableCell>
                  <TableCell sx={NO_WRAP_CELL_SX}>{LABELS.SOURCE[row.source]}</TableCell>
                  <TableCell sx={NO_WRAP_CELL_SX}>
                    {row.expiresAt !== undefined
                      ? expiresAtToJstDate(row.expiresAt)
                      : LABELS.NO_EXPIRY}
                    {row.previousExpiresAt !== undefined && (
                      <Typography variant="caption" color="text.secondary" component="span">
                        {' '}
                        (変更前: {expiresAtToJstDate(row.previousExpiresAt)})
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell sx={NO_WRAP_CELL_SX}>
                    <Chip size="sm" color={STATUS_COLOR[row.status]}>
                      {LABELS.STATUS[row.status]}
                    </Chip>
                    {row.pending !== null && (
                      <Chip size="sm" variant="outline" color="primary">
                        {LABELS.PENDING[row.pending]}
                      </Chip>
                    )}
                  </TableCell>
                  <TableCell sx={{ overflowWrap: 'anywhere' }}>{row.sourceRef ?? ''}</TableCell>
                  <TableCell>{renderOperations(row)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Box
        role="group"
        aria-label="課金の権利の追加"
        sx={{ mt: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-end' }}
      >
        <Select
          label="ロール"
          value={addRoleId}
          onChange={setAddRoleId}
          options={ROLE_OPTIONS}
          placeholder="選択してください"
          disabled={disabled}
        />
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Typography variant="caption" component="label" htmlFor="grant-add-date">
            有効期限 *
          </Typography>
          <input
            id="grant-add-date"
            type="date"
            value={addDate}
            min={minDate}
            disabled={disabled}
            onChange={(e) => setAddDate(e.target.value)}
            style={DATE_INPUT_STYLE}
          />
        </Box>
        <TextField
          label="メモ"
          value={addNote}
          maxLength={GRANT_NOTE_MAX_LENGTH}
          onChange={(e) => setAddNote(e.target.value)}
          // 外側のフォームの送信 (保存) を誤って起こさない
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
            }
          }}
          disabled={disabled}
        />
        <Button variant="outline" onClick={handleAdd} disabled={disabled}>
          追加
        </Button>
      </Box>
      {addError && <ErrorAlert message={addError} />}
      <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
        有効期限は、その日の終わり (日本時間) まで有効です。変更は「保存」を押すまで反映されません。
      </Typography>
    </Box>
  );
}
