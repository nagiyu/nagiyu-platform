'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Container, Typography } from '@mui/material';
import { Link } from '@nagiyu/ui';
import NoteList from '@/components/NoteList';
import type { NoteListItem } from '@/lib/notes/types';
import { fetchNotes } from '@/lib/notes/api-client';
import { NOTE_PAGE_GUIDANCE } from '@/lib/notes/messages';

/**
 * ノート一覧画面（`/notes`）。
 *
 * 勉強バッチが生成したノートを「プレゼント」として一覧表示する。
 * 一覧 + 詳細閲覧のみ（編集機能なし、記憶 UI と同じ割り切り）。
 */
export default function NotesPage() {
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await fetchNotes();
      setNotes(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ノートの取得に失敗しました');
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Container maxWidth="sm" sx={{ py: 2 }}>
      <Typography variant="h6" component="h1" sx={{ mb: 0.5 }}>
        ノート
      </Typography>
      <Alert severity="info" icon={false} sx={{ mb: 2, fontSize: '0.875rem', py: 0.5 }}>
        {NOTE_PAGE_GUIDANCE}
      </Alert>

      <Box>
        {error && (
          <Typography color="error" variant="body2" role="alert" sx={{ mb: 1 }}>
            {error}
          </Typography>
        )}
        <NoteList notes={notes} loading={loading} />
      </Box>

      <Box sx={{ textAlign: 'center', mt: 3 }}>
        <Link href="/">チャットに戻る</Link>
      </Box>
    </Container>
  );
}
