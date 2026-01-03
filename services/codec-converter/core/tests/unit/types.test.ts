import type { Job, JobStatus, CodecType } from '../../src/types';

describe('Types', () => {
  describe('JobStatus', () => {
    it('JobStatus型は正しい値を持つ', () => {
      const statuses: JobStatus[] = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'];

      statuses.forEach((status) => {
        expect(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']).toContain(status);
      });
    });
  });

  describe('CodecType', () => {
    it('CodecType型は正しい値を持つ', () => {
      const codecs: CodecType[] = ['h264', 'vp9', 'av1'];

      codecs.forEach((codec) => {
        expect(['h264', 'vp9', 'av1']).toContain(codec);
      });
    });
  });

  describe('Job', () => {
    it('Job型は必須フィールドを持つオブジェクトを受け入れる', () => {
      const job: Job = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        status: 'PENDING',
        inputFile: 'uploads/550e8400-e29b-41d4-a716-446655440000/input.mp4',
        outputCodec: 'h264',
        fileName: 'sample.mp4',
        fileSize: 52428800,
        createdAt: 1704067200,
        updatedAt: 1704067200,
        expiresAt: 1704153600,
      };

      expect(job.jobId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(job.status).toBe('PENDING');
      expect(job.outputCodec).toBe('h264');
    });

    it('Job型はオプショナルフィールドを持つオブジェクトを受け入れる', () => {
      const job: Job = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        status: 'COMPLETED',
        inputFile: 'uploads/550e8400-e29b-41d4-a716-446655440000/input.mp4',
        outputFile: 'outputs/550e8400-e29b-41d4-a716-446655440000/output.mp4',
        outputCodec: 'h264',
        fileName: 'sample.mp4',
        fileSize: 52428800,
        createdAt: 1704067200,
        updatedAt: 1704067800,
        expiresAt: 1704153600,
      };

      expect(job.outputFile).toBeDefined();
      expect(job.outputFile).toBe('outputs/550e8400-e29b-41d4-a716-446655440000/output.mp4');
    });

    it('Job型はerrorMessageを持つオブジェクトを受け入れる', () => {
      const job: Job = {
        jobId: '550e8400-e29b-41d4-a716-446655440000',
        status: 'FAILED',
        inputFile: 'uploads/550e8400-e29b-41d4-a716-446655440000/input.mp4',
        outputCodec: 'h264',
        fileName: 'sample.mp4',
        fileSize: 52428800,
        createdAt: 1704067200,
        updatedAt: 1704067800,
        expiresAt: 1704153600,
        errorMessage: '変換処理に失敗しました',
      };

      expect(job.errorMessage).toBeDefined();
      expect(job.errorMessage).toBe('変換処理に失敗しました');
    });
  });
});
