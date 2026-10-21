'use client';

import { Box, Stack, Typography } from '@mui/material';
import { LoadingState } from '@nagiyu/ui';
import type { NoteListItem } from '@/lib/notes/types';
import { getNoteEmptyMessage } from '@/lib/notes/messages';
import NoteCard from './NoteCard';

export interface NoteListProps {
  notes: NoteListItem[];
  loading: boolean;
  /** 選択中のキャラクター ID。省略時は既定キャラクターを使用する。 */
  characterId?: string;
}

/**
 * ノートカードの一覧表示。ローディング・空状態を内包する。
 */
export default function NoteList({ notes, loading, characterId }: NoteListProps) {
  if (loading) {
    return <LoadingState variant="inline" data-testid="note-loading" />;
  }

  if (notes.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }} data-testid="note-empty">
        <Typography variant="body2">{getNoteEmptyMessage(characterId)}</Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={1.5} data-testid="note-list">
      {notes.map((note) => (
        <NoteCard key={note.id} note={note} />
      ))}
    </Stack>
  );
}
