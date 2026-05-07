import {
  Box,
  Button,
  Chip,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { hasPermission } from '@nagiyu/common';
import type { ErrorEvent, ErrorSeverity } from '@nagiyu/common';
import { getDynamoDBDocumentClient } from '@nagiyu/aws';
import { createErrorEventReader, type ListErrorEventsQuery } from '@nagiyu/admin-core';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';

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

function formatJst(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function truncateMessage(message: string): string {
  const max = 80;
  if (message.length <= max) {
    return message;
  }
  return `${message.slice(0, max)}…`;
}

function buildDetailHref(event: ErrorEvent): string {
  const params = new URLSearchParams({
    at: event.occurredAt,
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
      <Box sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
        <Typography variant="h4" component="h1" gutterBottom>
          エラー履歴
        </Typography>
        <Typography color="error">この画面を表示する権限がありません</Typography>
      </Box>
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
            <TextField
              name="period"
              label="期間"
              select
              defaultValue={periodValue}
              size="small"
              sx={{ minWidth: 200 }}
            >
              {PERIOD_PRESETS.map((preset) => (
                <MenuItem key={preset.value} value={preset.value}>
                  {preset.label}
                </MenuItem>
              ))}
            </TextField>
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
                <TableCell>発生時刻 (JST)</TableCell>
                <TableCell>サービス</TableCell>
                <TableCell>重大度</TableCell>
                <TableCell>タイトル / 概要</TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((event) => (
                <TableRow key={`${event.serviceId}#${event.occurredAt}#${event.eventId}`} hover>
                  <TableCell>{formatJst(event.occurredAt)}</TableCell>
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
                  <TableCell>
                    <Typography variant="body2" component="div" sx={{ fontWeight: 'bold' }}>
                      {event.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {truncateMessage(event.message)}
                    </Typography>
                  </TableCell>
                  <TableCell>
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
