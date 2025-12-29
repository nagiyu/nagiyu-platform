'use client';

import { useState, useRef, FormEvent, DragEvent, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { validateFile, type CodecType } from '@nagiyu-platform/codec-converter-common';

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
    <main style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
      <h1>Codec Converter</h1>
      <p>動画ファイルのコーデックを変換します</p>

      <form onSubmit={handleSubmit}>
        {/* File Upload Area */}
        <div
          onClick={handleUploadClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          aria-label="ファイルをドラッグ&ドロップ または クリックして選択"
          style={{
            border: `2px dashed ${isDragging ? '#0070f3' : '#ccc'}`,
            borderRadius: '8px',
            padding: '3rem 2rem',
            textAlign: 'center',
            cursor: 'pointer',
            backgroundColor: isDragging ? '#f0f8ff' : '#fafafa',
            marginBottom: '2rem',
            minHeight: '200px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleUploadClick();
            }
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📁</div>
          <p style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>
            ファイルをドラッグ&ドロップ または クリックして選択
          </p>
          <p style={{ margin: 0, color: '#666', fontSize: '0.875rem' }}>
            MP4ファイルのみ、最大500MB
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            aria-label="ファイル選択"
          />
        </div>

        {/* Selected File Info */}
        {file && (
          <div
            style={{
              padding: '1rem',
              backgroundColor: '#f0f0f0',
              borderRadius: '4px',
              marginBottom: '2rem',
            }}
          >
            <p style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold' }}>選択されたファイル:</p>
            <p style={{ margin: 0 }}>
              {file.name} ({formatFileSize(file.size)})
            </p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div
            role="alert"
            style={{
              padding: '1rem',
              backgroundColor: '#fee',
              color: '#c00',
              borderRadius: '4px',
              marginBottom: '2rem',
              border: '1px solid #fcc',
            }}
          >
            {error}
          </div>
        )}

        {/* Codec Selection */}
        <fieldset
          style={{
            border: 'none',
            padding: 0,
            marginBottom: '2rem',
          }}
        >
          <legend style={{ fontWeight: 'bold', marginBottom: '1rem' }}>出力コーデック選択</legend>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="radio"
                name="codec"
                value="h264"
                checked={codec === 'h264'}
                onChange={(e) => setCodec(e.target.value as CodecType)}
                style={{ marginRight: '0.5rem' }}
              />
              <div>
                <strong>H.264</strong>
                <span style={{ color: '#666', marginLeft: '0.5rem' }}>- 互換性重視（MP4）</span>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="radio"
                name="codec"
                value="vp9"
                checked={codec === 'vp9'}
                onChange={(e) => setCodec(e.target.value as CodecType)}
                style={{ marginRight: '0.5rem' }}
              />
              <div>
                <strong>VP9</strong>
                <span style={{ color: '#666', marginLeft: '0.5rem' }}>- バランス型（WebM）</span>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="radio"
                name="codec"
                value="av1"
                checked={codec === 'av1'}
                onChange={(e) => setCodec(e.target.value as CodecType)}
                style={{ marginRight: '0.5rem' }}
              />
              <div>
                <strong>AV1</strong>
                <span style={{ color: '#666', marginLeft: '0.5rem' }}>- 高圧縮率（WebM）</span>
              </div>
            </label>
          </div>
        </fieldset>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!file || isUploading}
          style={{
            width: '100%',
            padding: '1rem',
            fontSize: '1rem',
            fontWeight: 'bold',
            color: '#fff',
            backgroundColor: !file || isUploading ? '#ccc' : '#0070f3',
            border: 'none',
            borderRadius: '4px',
            cursor: !file || isUploading ? 'not-allowed' : 'pointer',
          }}
        >
          {isUploading ? 'アップロード中...' : '変換開始'}
        </button>
      </form>
    </main>
  );
}
