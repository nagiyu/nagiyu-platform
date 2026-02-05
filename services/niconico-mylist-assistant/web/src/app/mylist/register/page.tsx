'use client';

import { Container, Typography, Box, Alert } from '@mui/material';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import MylistRegisterForm from '@/components/MylistRegisterForm';
import type { MylistRegisterResponse } from '@/types/mylist';

/**
 * マイリスト登録画面
 *
 * ユーザーが登録条件、ニコニコアカウント情報、マイリスト名を入力し、
 * バッチジョブを投入します。
 */
export default function MylistRegisterPage() {
  const router = useRouter();
  const [success, setSuccess] = useState<MylistRegisterResponse | null>(null);

  const handleSuccess = (response: MylistRegisterResponse) => {
    setSuccess(response);

    // 3秒後にステータス画面に遷移
    setTimeout(() => {
      router.push(`/mylist/status/${response.jobId}`);
    }, 3000);
  };

  return (
    <Container maxWidth="md">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          マイリスト登録
        </Typography>

        <Typography variant="body1" color="text.secondary" paragraph>
          登録したい動画の条件を指定し、ニコニコ動画のマイリストに自動登録します。
        </Typography>

        {/* 成功メッセージ */}
        {success && (
          <Alert severity="success" sx={{ mb: 3 }}>
            マイリスト登録ジョブを投入しました。
            <br />
            {success.selectedCount} 件の動画が選択されました。
            <br />
            ジョブID: {success.jobId}
            <br />
            <br />
            ステータス確認画面に移動します...
          </Alert>
        )}

        {/* 登録フォーム */}
        <MylistRegisterForm onSuccess={handleSuccess} />
      </Box>
    </Container>
  );
}
