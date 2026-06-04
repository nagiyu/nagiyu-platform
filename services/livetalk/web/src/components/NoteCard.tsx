'use client';

import NextLink from 'next/link';
import { Card, CardActionArea, CardContent, Stack, Typography } from '@mui/material';
import { Chip } from '@nagiyu/ui';
import type { NoteListItem } from '@/lib/notes/types';
import { formatNoteDate } from '@/lib/notes/messages';

export interface NoteCardProps {
  note: NoteListItem;
}

/**
 * ノート一覧の 1 枚分のカード。タップで詳細（`/notes/[id]`）に遷移する。
 * プレゼント体験を意識し、タイトル・カテゴリ・作成日をコンパクトに見せる。
 */
export default function NoteCard({ note }: NoteCardProps) {
  const isUnread = note.readAt === undefined;
  return (
    <Card variant="outlined" data-testid="note-card">
      <CardActionArea component={NextLink} href={`/notes/${note.id}`}>
        <CardContent sx={{ py: 1.5 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
            {isUnread && (
              <Chip color="secondary" size="sm" data-testid="note-unread-badge">
                NEW
              </Chip>
            )}
            <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600 }} noWrap>
              {note.title}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Chip variant="outline" size="sm">
              {note.relatedCategory}
            </Chip>
            <Typography variant="caption" color="text.secondary">
              {formatNoteDate(note.createdAt)}
            </Typography>
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
