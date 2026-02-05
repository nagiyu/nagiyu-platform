'use client';

import { useState } from 'react';
import { Container, Typography, Box, Button, Snackbar, Alert } from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import JobStatusDisplay from '@/components/JobStatusDisplay';
import type { BatchResult } from '@nagiyu/niconico-mylist-assistant-core';

interface JobStatusPageClientProps {
  jobId: string;
}

/**
 * ジョブステータス表示ページ（クライアントコンポーネント）
 *
 * バッチジョブのステータスをリアルタイムで表示し、完了時に通知します。
 */
export default function JobStatusPageClient({ jobId }: JobStatusPageClientProps) {
  const router = useRouter();
  const [notification, setNotification] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  /**
   * ジョブ完了時のコールバック
   */
  const handleJobComplete = (result: BatchResult) => {
    setNotification({
      open: true,
      message: `マイリスト登録が完了しました！ (成功: ${result.registeredCount}件, 失敗: ${result.failedCount}件)`,
      severity: 'success',
    });
  };

  /**
   * ジョブエラー時のコールバック
   */
  const handleJobError = (error: string) => {
    setNotification({
      open: true,
      message: `エラーが発生しました: ${error}`,
      severity: 'error',
    });
  };

  /**
   * 通知を閉じる
   */
  const handleCloseNotification = () => {
    setNotification((prev) => ({ ...prev, open: false }));
  };

  /**
   * 登録画面に戻る
   */
  const handleBack = () => {
    router.push('/mylist/register');
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        {/* ヘッダー */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={handleBack}>
            登録画面に戻る
          </Button>
          <Typography variant="h4" component="h1">
            ジョブステータス
          </Typography>
        </Box>

        {/* ジョブステータス表示 */}
        <JobStatusDisplay jobId={jobId} onComplete={handleJobComplete} onError={handleJobError} />

        {/* 通知（Snackbar） */}
        <Snackbar
          open={notification.open}
          autoHideDuration={6000}
          onClose={handleCloseNotification}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            onClose={handleCloseNotification}
            severity={notification.severity}
            sx={{ width: '100%' }}
          >
            {notification.message}
          </Alert>
        </Snackbar>
      </Box>
    </Container>
  );
}
