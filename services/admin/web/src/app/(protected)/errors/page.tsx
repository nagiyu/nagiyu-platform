import {
  Box,
  // eslint-disable-next-line no-restricted-imports -- href + variant="text" 連携が @nagiyu/ui Button 未対応のため保留 (Issue #2900 Phase 2 以降で置換予定)
  Button,
  // eslint-disable-next-line no-restricted-imports -- color="info" / label プロップが @nagiyu/ui Chip 未対応のため保留 (Issue #2900 Phase 2 以降で置換予定)
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  // eslint-disable-next-line no-restricted-imports -- sx={{ minWidth }} と size="small" の組み合わせが必要なため MUI TextField を利用する
  TextField,
  Typography,
} from '@mui/material';
import { formatJstDateTime, hasPermission } from '@nagiyu/common';
import { AccessDeniedView } from '@nagiyu/ui';
import type { ErrorEvent, ErrorSeverity } from '@nagiyu/common';
import { getDynamoDBDocumentClient } from '@nagiyu/aws';
import { createErrorEventReader, type ListErrorEventsQuery } from '@nagiyu/admin-core';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import PeriodFilterSelect from '@/components/errors/PeriodFilterSelect';

const ERROR_MESSAGES = {
  ERROR_EVENTS_TABLE_NAME_REQUIRED: 'ERROR_EVENTS_TABLE_NAME が設定されていません',
} as const;

const SEVERITY_COLORS: Record<ErrorSeverity, 'info' | 'warning' | 'error'> = {
  info: 'info',
  warning: 'warning',
  error: 'error',
  critical: 'error',
};

const PERIOD_PRESETS = [
  { label: '直近 24 時間', value: '24h', hours: 24 },
  { label: '直近 7 日', value: '7d', hours: 24 * 7 },
  { label: '直近 30 日', value: '30d', hours: 24 * 30 },
  { label: '指定なし', value: 'all', hours: 0 },
] as const;

type PeriodPresetValue = (typeof PERIOD_PRESETS)[number]['value'];

function isPeriodPreset(value: string): value is PeriodPresetValue {
  return PERIOD_PRESETS.some((preset) => preset.value === value);
}

function getReader() {
  const docClient =
    process.env.USE_IN_MEMORY_DB === 'true' ? undefined : getDynamoDBDocumentClient();
  const tableName = process.env.ERROR_EVENTS_TABLE_NAME;

  if (!docClient) {
    return createErrorEventReader(undefined, undefined);
  }

  if (!tableName) {
    throw new Error(ERROR_MESSAGES.ERROR_EVENTS_TABLE_NAME_REQUIRED);
  }

  return createErrorEventReader(docClient, tableName);
}

function buildQueryFromSearchParams(searchParams: {
  serviceId?: string;
  period?: string;
  cursor?: string;
}): ListErrorEventsQuery {
  const query: ListErrorEventsQuery = {};

  if (searchParams.serviceId) {
    query.serviceId = searchParams.serviceId;
  }

  const periodValue = searchParams.period ?? '24h';
  const period = isPeriodPreset(periodValue) ? periodValue : '24h';
  const preset = PERIOD_PRESETS.find((p) => p.value === period);
  if (preset && preset.hours > 0) {
    const fromMillis = Date.now() - preset.hours * 60 * 60 * 1000;
    query.from = new Date(fromMillis).toISOString();
  }

  if (searchParams.cursor) {
    query.cursor = searchParams.cursor;
  }

  return query;
}

// 空白の無い長い概要で表が広がって操作列が押し出されないよう、概要の列だけ折り返す。
// 最小幅が無いと他の列に幅を取られて極端に潰れる
const SUMMARY_CELL_SX = { minWidth: 240, overflowWrap: 'anywhere' } as const;

// 日時や操作ボタンは、列が狭いときに途中で改行されると読みにくい
const NO_WRAP_CELL_SX = { whiteSpace: 'nowrap' } as const;

function truncateMessage(message: string): string {
  const max = 80;
  if (message.length <= max) {
    return message;
  }
  return `${message.slice(0, max)}…`;
}

function buildDetailHref(event: ErrorEvent): string {
  const params = new URLSearchParams({
    at: String(event.occurredAt),
    serviceId: event.serviceId,
  });
  return `/errors/${encodeURIComponent(event.eventId)}?${params.toString()}`;
}

type PageSearchParams = {
  serviceId?: string;
  period?: string;
  cursor?: string;
};

export default async function ErrorsListPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const session = await getSession();
  if (!session) {
    const authUrl = process.env.NEXT_PUBLIC_AUTH_URL || process.env.NEXTAUTH_URL || '';
    redirect(`${authUrl}/signin`);
  }

  if (!hasPermission(session.user.roles, 'errors:read')) {
    return (
      <AccessDeniedView
        authUrl={process.env.NEXT_PUBLIC_AUTH_URL || process.env.NEXTAUTH_URL || ''}
      />
    );
  }

  const params = (await searchParams) ?? {};
  const query = buildQueryFromSearchParams(params);
  const reader = getReader();
  const { items, nextCursor } = await reader.list(query);

  const periodValue = isPeriodPreset(params.period ?? '24h') ? (params.period ?? '24h') : '24h';

  const nextHrefParams = new URLSearchParams();
  if (params.serviceId) {
    nextHrefParams.set('serviceId', params.serviceId);
  }
  nextHrefParams.set('period', periodValue);
  if (nextCursor) {
    nextHrefParams.set('cursor', nextCursor);
  }
  const nextHref = nextCursor ? `/errors?${nextHrefParams.toString()}` : null;

  return (
    <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
      <Typography variant="h4" component="h1" gutterBottom>
        エラー履歴
      </Typography>

      <Paper sx={{ p: 2, mb: 2 }}>
        <form method="get" action="/errors">
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              alignItems: { xs: 'stretch', sm: 'flex-end' },
              gap: 2,
            }}
          >
            <TextField
              name="serviceId"
              label="サービス ID"
              defaultValue={params.serviceId ?? ''}
              size="small"
              sx={{ minWidth: 200 }}
            />
            <Box sx={{ minWidth: 200 }}>
              <PeriodFilterSelect
                defaultValue={periodValue}
                options={PERIOD_PRESETS.map((preset) => ({
                  value: preset.value,
                  label: preset.label,
                }))}
              />
            </Box>
            <Button type="submit" variant="contained">
              絞り込み
            </Button>
          </Box>
        </form>
      </Paper>

      {items.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">エラー履歴がありません</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={NO_WRAP_CELL_SX}>発生時刻 (JST)</TableCell>
                <TableCell sx={NO_WRAP_CELL_SX}>サービス</TableCell>
                <TableCell sx={NO_WRAP_CELL_SX}>重大度</TableCell>
                <TableCell sx={{ ...NO_WRAP_CELL_SX, ...SUMMARY_CELL_SX }}>
                  タイトル / 概要
                </TableCell>
                <TableCell sx={NO_WRAP_CELL_SX}></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((event) => (
                <TableRow key={`${event.serviceId}#${event.occurredAt}#${event.eventId}`} hover>
                  <TableCell sx={NO_WRAP_CELL_SX}>
                    {formatJstDateTime(event.occurredAt, { seconds: true })}
                  </TableCell>
                  <TableCell>
                    <Chip label={event.serviceId} size="small" />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={event.severity}
                      size="small"
                      color={SEVERITY_COLORS[event.severity]}
                    />
                  </TableCell>
                  <TableCell sx={SUMMARY_CELL_SX}>
                    <Typography variant="body2" component="div" sx={{ fontWeight: 'bold' }}>
                      {event.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {truncateMessage(event.message)}
                    </Typography>
                  </TableCell>
                  <TableCell sx={NO_WRAP_CELL_SX}>
                    <Button href={buildDetailHref(event)} size="small" variant="text">
                      詳細
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {nextHref && (
        <Box sx={{ mt: 2, textAlign: 'center' }}>
          <Button href={nextHref} variant="outlined">
            次のページ
          </Button>
        </Box>
      )}

      <Box sx={{ mt: 3 }}>
        <Button href="/dashboard" variant="text">
          ← ダッシュボードへ戻る
        </Button>
      </Box>
    </Box>
  );
}
