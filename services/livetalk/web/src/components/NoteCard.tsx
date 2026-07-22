'use client';

import NextLink from 'next/link';
import { Card, CardActionArea, CardContent, Typography } from '@mui/material';
import type { NoteListItem } from '@/lib/notes/types';
import { formatNoteDate } from '@/lib/notes/messages';

export interface NoteCardProps {
  note: NoteListItem;
}

/**
 * ノート一覧の 1 枚分のカード。タップで詳細（`/notes/[id]`）に遷移する。
 * 「◯月◯日、△△を調べたよ」というプレゼント体験を意識し、主題（subject）と
 * 贈られた日付をコンパクトに見せる（旧カテゴリ Chip・未読 NEW バッジは廃止）。
 */
export default function NoteCard({ note }: NoteCardProps) {
  return (
    <Card variant="outlined" data-testid="note-card">
      <CardActionArea component={NextLink} href={`/notes/${note.id}`}>
        <CardContent sx={{ py: 1.5 }}>
          <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600, mb: 0.5 }} noWrap>
            {note.subject}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formatNoteDate(note.sharedAt)}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
