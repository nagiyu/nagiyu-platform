'use client';

import { useState } from 'react';
import { Container, Typography, Box, Paper, Button, Alert, Snackbar } from '@mui/material';
import { PlayArrow as PlayArrowIcon } from '@mui/icons-material';
import JobStatusDisplay from '@/components/JobStatusDisplay';
import type { BatchResult } from '@nagiyu/niconico-mylist-assistant-core';

/**
 * マイリスト登録ページ（クライアントコンポーネント）
 *
 * ジョブステータスを表示し、マイリスト登録の進捗を追跡します。
 * Issue 5-5 でフォーム実装後、このページに統合されます。
 */
export default function RegisterPageClient({ jobId }: { jobId?: string }) {
  const [currentJobId, setCurrentJobId] = useState<string | undefined>(jobId);
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
   * デモ用: ダミーのジョブIDを設定
   * Issue 5-5 のフォーム実装後、このボタンは不要になります
   */
  const handleStartDemo = () => {
    // デモ用のダミージョブID（実際のジョブは存在しない可能性があります）
    const demoJobId = `demo-job-${Date.now()}`;
    setCurrentJobId(demoJobId);
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          マイリスト自動登録
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          条件を指定してマイリストに動画を自動登録します。
        </Typography>

        {/* Issue 5-5 で実装予定: 登録フォーム */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            登録フォーム
          </Typography>
          <Alert severity="info" sx={{ mb: 2 }}>
            登録フォームは Issue 5-5 で実装予定です。
            <br />
            現在は、ジョブステータス表示機能のみ実装されています。
          </Alert>

          {/* デモ用ボタン */}
          {!currentJobId && (
            <Button
              variant="contained"
              color="primary"
              startIcon={<PlayArrowIcon />}
              onClick={handleStartDemo}
              sx={{ mt: 2 }}
            >
              デモ: ステータス表示を開始
            </Button>
          )}
        </Paper>

        {/* ジョブステータス表示 */}
        {currentJobId && (
          <JobStatusDisplay
            jobId={currentJobId}
            onComplete={handleJobComplete}
            onError={handleJobError}
          />
        )}

        {/* ジョブIDなしの案内（デモボタンを表示した後は非表示） */}
        {!currentJobId && !jobId && (
          <Alert severity="info" sx={{ mt: 2 }}>
            ジョブを開始するには、上記のデモボタンをクリックしてください。
            <br />
            Issue 5-5 でフォーム実装後は、フォームから直接ジョブを投入できるようになります。
          </Alert>
        )}

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
