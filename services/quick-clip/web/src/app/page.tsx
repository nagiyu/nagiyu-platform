'use client';

import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, Container, Paper, Typography } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

const ERROR_MESSAGES = {
  SELECT_FILE: '動画ファイルを選択してください',
  CREATE_JOB_FAILED: 'アップロード処理の開始に失敗しました',
  INVALID_UPLOAD_PARAMETERS: 'アップロードパラメータが不正です',
  UPLOAD_FAILED: '動画ファイルのアップロードに失敗しました',
  COMPLETE_UPLOAD_FAILED: 'アップロード完了処理に失敗しました',
  UNKNOWN: '予期しないエラーが発生しました',
} as const;

const LOG_MESSAGES = {
  UPLOAD_FAILED: '動画アップロードに失敗しました',
  UPLOAD_EXCEPTION: '動画アップロード時に予期しないエラーが発生しました',
  COMPLETE_UPLOAD_FAILED: 'マルチパートアップロード完了処理に失敗しました',
  INVALID_MULTIPART_PARAMETERS: 'マルチパートアップロードパラメータが不正です',
  UNKNOWN: 'アップロード処理の開始時に予期しないエラーが発生しました',
} as const;

const ACCEPTED_FILE_TYPE = 'video/mp4';

type CreateJobResponse = {
  jobId: string;
  uploadUrl?: string;
  multipart?: {
    uploadId: string;
    uploadUrls: string[];
    chunkSize: number;
  };
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
        if (data.multipart) {
          const chunkSizeBytes = data.multipart.chunkSize;
          if (!Number.isInteger(chunkSizeBytes) || chunkSizeBytes <= 0) {
            console.error(LOG_MESSAGES.INVALID_MULTIPART_PARAMETERS, {
              chunkSizeBytes,
            });
            setErrorMessage(ERROR_MESSAGES.INVALID_UPLOAD_PARAMETERS);
            setIsSubmitting(false);
            return;
          }

          const expectedPartCount = Math.ceil(file.size / chunkSizeBytes);
          if (expectedPartCount <= 0 || expectedPartCount !== data.multipart.uploadUrls.length) {
            console.error(LOG_MESSAGES.INVALID_MULTIPART_PARAMETERS, {
              expectedPartCount,
              uploadUrlCount: data.multipart.uploadUrls.length,
            });
            setErrorMessage(ERROR_MESSAGES.INVALID_UPLOAD_PARAMETERS);
            setIsSubmitting(false);
            return;
          }

          const parts: Array<{ PartNumber: number; ETag: string }> = [];
          for (const [index, uploadUrl] of data.multipart.uploadUrls.entries()) {
            const start = index * chunkSizeBytes;
            const end = Math.min(start + chunkSizeBytes, file.size);
            const chunk = file.slice(start, end);
            const uploadResponse = await fetch(uploadUrl, {
              method: 'PUT',
              headers: {
                'Content-Type': ACCEPTED_FILE_TYPE,
              },
              body: chunk,
            });

            const eTag = uploadResponse.headers.get('ETag');
            if (!uploadResponse.ok) {
              console.error(LOG_MESSAGES.UPLOAD_FAILED, {
                status: uploadResponse.status,
                partNumber: index + 1,
              });
              setErrorMessage(ERROR_MESSAGES.UPLOAD_FAILED);
              setIsSubmitting(false);
              return;
            }
            if (!eTag) {
              console.error(LOG_MESSAGES.UPLOAD_FAILED, {
                partNumber: index + 1,
                eTag,
                reason: 'ETagが取得できませんでした',
              });
              setErrorMessage(ERROR_MESSAGES.UPLOAD_FAILED);
              setIsSubmitting(false);
              return;
            }

            parts.push({
              PartNumber: index + 1,
              ETag: eTag,
            });
          }

          const completeUploadResponse = await fetch(`/api/jobs/${data.jobId}/complete-upload`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              uploadId: data.multipart.uploadId,
              parts,
            }),
          });

          if (!completeUploadResponse.ok) {
            console.error(LOG_MESSAGES.COMPLETE_UPLOAD_FAILED, {
              status: completeUploadResponse.status,
            });
            setErrorMessage(ERROR_MESSAGES.COMPLETE_UPLOAD_FAILED);
            setIsSubmitting(false);
            return;
          }
        } else if (data.uploadUrl) {
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
        } else {
          setErrorMessage(ERROR_MESSAGES.CREATE_JOB_FAILED);
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
