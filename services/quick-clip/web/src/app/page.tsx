'use client';

import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, Container, Paper, Typography } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

const ERROR_MESSAGES = {
  SELECT_FILE: '動画ファイルを選択してください',
  CREATE_JOB_FAILED: 'アップロード処理の開始に失敗しました',
  UPLOAD_FAILED: '動画ファイルのアップロードに失敗しました',
  UNKNOWN: '予期しないエラーが発生しました',
} as const;

const LOG_MESSAGES = {
  UPLOAD_FAILED: '動画アップロードに失敗しました',
  UPLOAD_EXCEPTION: '動画アップロード時に予期しないエラーが発生しました',
  UNKNOWN: 'アップロード処理の開始時に予期しないエラーが発生しました',
} as const;

const ACCEPTED_FILE_TYPE = 'video/mp4';

type CreateJobResponse = {
  jobId: string;
  uploadUrl: string;
};

export default function Home() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const setSelectedFile = (selected: File | null) => {
    setFile(selected);
    setErrorMessage(null);
  };

  const onSelectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setSelectedFile(selected);
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const selected = event.dataTransfer.files?.[0] ?? null;
    setSelectedFile(selected);
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!file) {
      setErrorMessage(ERROR_MESSAGES.SELECT_FILE);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          contentType: file.type,
        }),
      });

      if (!response.ok) {
        setErrorMessage(ERROR_MESSAGES.CREATE_JOB_FAILED);
        setIsSubmitting(false);
        return;
      }

      const data = (await response.json()) as CreateJobResponse;

      try {
        const uploadResponse = await fetch(data.uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': ACCEPTED_FILE_TYPE,
          },
          body: file,
        });

        if (!uploadResponse.ok) {
          console.error(LOG_MESSAGES.UPLOAD_FAILED, {
            status: uploadResponse.status,
          });
          setErrorMessage(ERROR_MESSAGES.UPLOAD_FAILED);
          setIsSubmitting(false);
          return;
        }
      } catch (error) {
        console.error(LOG_MESSAGES.UPLOAD_EXCEPTION, error);
        setErrorMessage(ERROR_MESSAGES.UPLOAD_FAILED);
        setIsSubmitting(false);
        return;
      }

      router.push(`/jobs/${data.jobId}`);
    } catch (error) {
      console.error(LOG_MESSAGES.UNKNOWN, error);
      setErrorMessage(ERROR_MESSAGES.UNKNOWN);
      setIsSubmitting(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Paper sx={{ p: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          QuickClip
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          動画をアップロードして見どころ抽出を開始します。
        </Typography>

        <form onSubmit={onSubmit}>
          <Paper
            variant="outlined"
            sx={{
              p: 4,
              textAlign: 'center',
              borderStyle: 'dashed',
              borderColor: isDragging ? 'primary.main' : 'divider',
              backgroundColor: isDragging ? 'action.hover' : 'background.paper',
              mb: 2,
              cursor: 'pointer',
            }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            role="button"
            tabIndex={0}
            aria-label="動画ファイルを選択"
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
          >
            <CloudUploadIcon color="primary" sx={{ fontSize: 56, mb: 1 }} />
            <Typography variant="body1" fontWeight={700}>
              ドラッグ&ドロップ または クリックして動画ファイルを選択
            </Typography>
            <Typography variant="body2" color="text.secondary">
              MP4 形式に対応
            </Typography>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_FILE_TYPE}
              hidden
              onChange={onSelectFile}
            />
          </Paper>

          {file && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2">選択中: {file.name}</Typography>
            </Box>
          )}

          {errorMessage && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {errorMessage}
            </Alert>
          )}

          <Button type="submit" variant="contained" disabled={!file || isSubmitting}>
            {isSubmitting ? '開始中...' : 'アップロードして処理開始'}
          </Button>
        </form>
      </Paper>
    </Container>
  );
}
