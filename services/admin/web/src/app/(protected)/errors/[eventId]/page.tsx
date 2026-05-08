import {
  Box,
  // eslint-disable-next-line no-restricted-imports -- href + variant="text" 連携が @nagiyu/ui Button 未対応のため保留 (Issue #2900 Phase 2 以降で置換予定)
  Button,
  Card,
  CardContent,
  // eslint-disable-next-line no-restricted-imports -- color="info" / label プロップが @nagiyu/ui Chip 未対応のため保留 (Issue #2900 Phase 2 以降で置換予定)
  Chip,
  Divider,
  Typography,
} from '@mui/material';
import { hasPermission } from '@nagiyu/common';
import type { ErrorSeverity } from '@nagiyu/common';
import { getDynamoDBDocumentClient } from '@nagiyu/aws';
import { createErrorEventReader } from '@nagiyu/admin-core';
import { notFound, redirect } from 'next/navigation';
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

function tryFormatJson(value: string): string {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

type PageSearchParams = {
  at?: string;
  serviceId?: string;
};

export default async function ErrorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
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
          エラー詳細
        </Typography>
        <Typography color="error">この画面を表示する権限がありません</Typography>
      </Box>
    );
  }

  const { eventId } = await params;
  const sp = (await searchParams) ?? {};
  const occurredAt = sp.at;
  const serviceId = sp.serviceId;

  if (!occurredAt || !serviceId) {
    notFound();
  }

  const reader = getReader();
  const event = await reader.findById(eventId, occurredAt, serviceId);

  if (!event) {
    notFound();
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1000, mx: 'auto' }}>
      <Box sx={{ mb: 2 }}>
        <Button href="/errors" variant="text">
          ← エラー履歴に戻る
        </Button>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 2, mb: 2 }}>
        <Chip label={event.severity} size="small" color={SEVERITY_COLORS[event.severity]} />
        <Typography variant="h5" component="h1">
          {event.title}
        </Typography>
      </Box>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            メタ情報
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', flexDirection: 'row', gap: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120 }}>
                eventId
              </Typography>
              <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                {event.eventId}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'row', gap: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120 }}>
                serviceId
              </Typography>
              <Typography variant="body2">{event.serviceId}</Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'row', gap: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120 }}>
                source
              </Typography>
              <Typography variant="body2">{event.source}</Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'row', gap: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120 }}>
                発生時刻 (JST)
              </Typography>
              <Typography variant="body2">{formatJst(event.occurredAt)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'row', gap: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ minWidth: 120 }}>
                発生時刻 (UTC)
              </Typography>
              <Typography variant="body2">{event.occurredAt}</Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            本文
          </Typography>
          <Typography
            variant="body2"
            component="pre"
            sx={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', m: 0 }}
          >
            {event.message}
          </Typography>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            コンテキスト
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <Box
            component="pre"
            sx={{
              fontSize: 13,
              backgroundColor: 'grey.100',
              p: 2,
              borderRadius: 1,
              overflow: 'auto',
              m: 0,
            }}
          >
            {tryFormatJson(event.context)}
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
