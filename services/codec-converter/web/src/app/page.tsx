'use client';

import { useState, useRef, FormEvent, DragEvent, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { validateFile, type CodecType } from 'codec-converter-core';
import {
  Container,
  Typography,
  Paper,
  Button,
  Alert,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Box,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

type UploadError = {
  message: string;
};

export default function Home() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [codec, setCodec] = useState<CodecType>('h264');
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileValidation = (selectedFile: File): boolean => {
    const validation = validateFile(selectedFile.name, selectedFile.size, selectedFile.type);

    if (!validation.isValid) {
      setError(validation.errorMessage || 'バリデーションエラー');
      return false;
    }

    setError(null);
    return true;
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && handleFileValidation(selectedFile)) {
      setFile(selectedFile);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && handleFileValidation(droppedFile)) {
      setFile(droppedFile);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!file) {
      setError('ファイルを選択してください');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      // Step 1: Create job and get presigned URL
      const createJobResponse = await fetch('/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          contentType: file.type,
          outputCodec: codec,
        }),
      });

      if (!createJobResponse.ok) {
        const errorData = (await createJobResponse.json()) as UploadError;
        throw new Error(errorData.message || 'ジョブの作成に失敗しました');
      }

      const { jobId, uploadUrl } = await createJobResponse.json();

      // Step 2: Upload file to S3 using presigned URL
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('ファイルのアップロードに失敗しました');
      }

      // Step 3: Submit the job for processing
      const submitResponse = await fetch(`/api/jobs/${jobId}/submit`, {
        method: 'POST',
      });

      if (!submitResponse.ok) {
        const errorData = (await submitResponse.json()) as UploadError;
        throw new Error(errorData.message || 'ジョブの投入に失敗しました');
      }

      // Step 4: Redirect to job details page
      router.push(`/jobs/${jobId}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '予期しないエラーが発生しました';
      setError(errorMessage);
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(2)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Codec Converter
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        動画ファイルのコーデックを変換します
      </Typography>

      <form onSubmit={handleSubmit}>
        {/* File Upload Area */}
        <Paper
          onClick={handleUploadClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          aria-label="ファイルをドラッグ&ドロップ または クリックして選択"
          elevation={isDragging ? 8 : 2}
          sx={{
            border: (theme) =>
              `2px dashed ${isDragging ? theme.palette.primary.main : theme.palette.divider}`,
            borderRadius: 2,
            p: 6,
            textAlign: 'center',
            cursor: 'pointer',
            backgroundColor: isDragging ? 'action.hover' : 'background.default',
            mb: 3,
            minHeight: 200,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            transition: 'all 0.2s ease',
            '&:hover': {
              backgroundColor: 'action.hover',
            },
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleUploadClick();
            }
          }}
        >
          <CloudUploadIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
          <Typography variant="body1" fontWeight="bold" sx={{ mb: 1 }}>
            ファイルをドラッグ&ドロップ または クリックして選択
          </Typography>
          <Typography variant="body2" color="text.secondary">
            MP4ファイルのみ、最大500MB
          </Typography>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            aria-label="ファイル選択"
          />
        </Paper>

        {/* Selected File Info */}
        {file && (
          <Paper sx={{ p: 2, mb: 3, backgroundColor: 'grey.100' }}>
            <Typography variant="body2" fontWeight="bold" sx={{ mb: 0.5 }}>
              選択されたファイル:
            </Typography>
            <Typography variant="body2">
              {file.name} ({formatFileSize(file.size)})
            </Typography>
          </Paper>
        )}

        {/* Error Message */}
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {/* Codec Selection */}
        <FormControl component="fieldset" sx={{ mb: 3, width: '100%' }}>
          <FormLabel component="legend" sx={{ mb: 2, fontWeight: 'bold' }}>
            出力コーデック選択
          </FormLabel>
          <RadioGroup
            value={codec}
            onChange={(e) => setCodec(e.target.value as CodecType)}
            aria-label="出力コーデック"
          >
            <FormControlLabel
              value="h264"
              control={<Radio />}
              label={
                <Box>
                  <Typography component="span" fontWeight="bold">
                    H.264
                  </Typography>
                  <Typography component="span" color="text.secondary" sx={{ ml: 1 }}>
                    - 互換性重視（MP4）
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel
              value="vp9"
              control={<Radio />}
              label={
                <Box>
                  <Typography component="span" fontWeight="bold">
                    VP9
                  </Typography>
                  <Typography component="span" color="text.secondary" sx={{ ml: 1 }}>
                    - バランス型（WebM）
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel
              value="av1"
              control={<Radio />}
              label={
                <Box>
                  <Typography component="span" fontWeight="bold">
                    AV1
                  </Typography>
                  <Typography component="span" color="text.secondary" sx={{ ml: 1 }}>
                    - 高圧縮率（WebM）
                  </Typography>
                </Box>
              }
            />
          </RadioGroup>
        </FormControl>

        {/* Submit Button */}
        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={!file || isUploading}
          fullWidth
          sx={{ py: 1.5 }}
        >
          {isUploading ? 'アップロード中...' : '変換開始'}
        </Button>
      </form>
    </Container>
  );
}
