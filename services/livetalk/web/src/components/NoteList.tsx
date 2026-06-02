'use client';

import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import type { NoteListItem } from '@/lib/notes/types';
import { NOTE_EMPTY_MESSAGE } from '@/lib/notes/messages';
import NoteCard from './NoteCard';

export interface NoteListProps {
  notes: NoteListItem[];
  loading: boolean;
}

/**
 * ノートカードの一覧表示。ローディング・空状態を内包する。
 */
export default function NoteList({ notes, loading }: NoteListProps) {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }} data-testid="note-loading">
        <CircularProgress />
      </Box>
    );
  }

  if (notes.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }} data-testid="note-empty">
        <Typography variant="body2">{NOTE_EMPTY_MESSAGE}</Typography>
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
