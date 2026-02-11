import { NextRequest } from 'next/server';
import { POST } from '@/app/api/jobs/[jobId]/submit/route';
import { getAwsClients } from '@/lib/aws-clients';
import { selectJobDefinition } from 'codec-converter-core';

// Mock dependencies
jest.mock('@/lib/aws-clients');
jest.mock('codec-converter-core', () => ({
  ...jest.requireActual('codec-converter-core'),
  selectJobDefinition: jest.fn(),
}));

const mockGetAwsClients = getAwsClients as jest.MockedFunction<typeof getAwsClients>;
const mockSelectJobDefinition = selectJobDefinition as jest.MockedFunction<
  typeof selectJobDefinition
>;

describe('POST /api/jobs/[jobId]/submit', () => {
  let mockDocClient: {
    send: jest.Mock;
  };
  let mockS3Client: {
    send: jest.Mock;
  };
  let mockBatchClient: {
    send: jest.Mock;
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup mock AWS clients
    mockDocClient = { send: jest.fn() };
    mockS3Client = { send: jest.fn() };
    mockBatchClient = { send: jest.fn() };

    mockGetAwsClients.mockReturnValue({
      docClient: mockDocClient as any,
      s3Client: mockS3Client as any,
      batchClient: mockBatchClient as any,
    });

    // Setup environment variables
    process.env.DYNAMODB_TABLE = 'test-table';
    process.env.S3_BUCKET = 'test-bucket';
    process.env.BATCH_JOB_QUEUE = 'test-queue';
    process.env.BATCH_JOB_DEFINITION_PREFIX = 'codec-converter-dev';
    process.env.AWS_REGION = 'us-east-1';
  });

  describe('Dynamic Resource Selection', () => {
    it('should select small job definition for small file with H.264', async () => {
      // Setup
      const jobId = 'test-job-small-h264';
      const mockJob = {
        jobId,
        status: 'PENDING',
        fileSize: 50 * 1024 * 1024, // 50MB
        outputCodec: 'h264',
        inputFile: 'input/test.mp4',
      };

      mockDocClient.send.mockResolvedValueOnce({ Item: mockJob });
      mockS3Client.send.mockResolvedValueOnce({});
      mockBatchClient.send.mockResolvedValueOnce({});
      mockSelectJobDefinition.mockReturnValue('small');

      const request = new NextRequest('http://localhost/api/jobs/test-job-small-h264/submit', {
        method: 'POST',
      });

      // Execute
      const response = await POST(request, { params: Promise.resolve({ jobId }) });
      const data = await response.json();

      // Verify
      expect(response.status).toBe(200);
      expect(data.jobId).toBe(jobId);
      expect(mockSelectJobDefinition).toHaveBeenCalledWith(50 * 1024 * 1024, 'h264');
      expect(mockBatchClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            jobDefinition: 'codec-converter-dev-small',
          }),
        })
      );
    });

    it('should select xlarge job definition for large file with AV1', async () => {
      // Setup
      const jobId = 'test-job-xlarge-av1';
      const mockJob = {
        jobId,
        status: 'PENDING',
        fileSize: 400 * 1024 * 1024, // 400MB
        outputCodec: 'av1',
        inputFile: 'input/test.mp4',
      };

      mockDocClient.send.mockResolvedValueOnce({ Item: mockJob });
      mockS3Client.send.mockResolvedValueOnce({});
      mockBatchClient.send.mockResolvedValueOnce({});
      mockSelectJobDefinition.mockReturnValue('xlarge');

      const request = new NextRequest('http://localhost/api/jobs/test-job-xlarge-av1/submit', {
        method: 'POST',
      });

      // Execute
      const response = await POST(request, { params: Promise.resolve({ jobId }) });
      const data = await response.json();

      // Verify
      expect(response.status).toBe(200);
      expect(data.jobId).toBe(jobId);
      expect(mockSelectJobDefinition).toHaveBeenCalledWith(400 * 1024 * 1024, 'av1');
      expect(mockBatchClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            jobDefinition: 'codec-converter-dev-xlarge',
          }),
        })
      );
    });

    it('should select medium job definition for medium file with VP9', async () => {
      // Setup
      const jobId = 'test-job-medium-vp9';
      const mockJob = {
        jobId,
        status: 'PENDING',
        fileSize: 150 * 1024 * 1024, // 150MB
        outputCodec: 'vp9',
        inputFile: 'input/test.mp4',
      };

      mockDocClient.send.mockResolvedValueOnce({ Item: mockJob });
      mockS3Client.send.mockResolvedValueOnce({});
      mockBatchClient.send.mockResolvedValueOnce({});
      mockSelectJobDefinition.mockReturnValue('large');

      const request = new NextRequest('http://localhost/api/jobs/test-job-medium-vp9/submit', {
        method: 'POST',
      });

      // Execute
      const response = await POST(request, { params: Promise.resolve({ jobId }) });
      const data = await response.json();

      // Verify
      expect(response.status).toBe(200);
      expect(data.jobId).toBe(jobId);
      expect(mockSelectJobDefinition).toHaveBeenCalledWith(150 * 1024 * 1024, 'vp9');
      expect(mockBatchClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            jobDefinition: 'codec-converter-dev-large',
          }),
        })
      );
    });
  });

  describe('Error Handling - Resource Selection Fallback', () => {
    it('should fallback to medium when selectJobDefinition throws error', async () => {
      // Setup
      const jobId = 'test-job-fallback';
      const mockJob = {
        jobId,
        status: 'PENDING',
        fileSize: 50 * 1024 * 1024,
        outputCodec: 'h264',
        inputFile: 'input/test.mp4',
      };

      mockDocClient.send.mockResolvedValueOnce({ Item: mockJob });
      mockS3Client.send.mockResolvedValueOnce({});
      mockBatchClient.send.mockResolvedValueOnce({});
      mockSelectJobDefinition.mockImplementation(() => {
        throw new Error('Invalid codec');
      });

      const request = new NextRequest('http://localhost/api/jobs/test-job-fallback/submit', {
        method: 'POST',
      });

      // Execute
      const response = await POST(request, { params: Promise.resolve({ jobId }) });
      const data = await response.json();

      // Verify
      expect(response.status).toBe(200);
      expect(data.jobId).toBe(jobId);
      expect(mockBatchClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            jobDefinition: 'codec-converter-dev-medium',
          }),
        })
      );
    });
  });

  describe('Error Handling - Batch Job Definition Fallback', () => {
    it('should fallback to medium when Batch submit fails due to invalid job definition', async () => {
      // Setup
      const jobId = 'test-job-batch-fallback';
      const mockJob = {
        jobId,
        status: 'PENDING',
        fileSize: 50 * 1024 * 1024,
        outputCodec: 'h264',
        inputFile: 'input/test.mp4',
      };

      mockDocClient.send.mockResolvedValueOnce({ Item: mockJob });
      mockS3Client.send.mockResolvedValueOnce({});
      mockSelectJobDefinition.mockReturnValue('small');

      // First batch call fails, second succeeds
      mockBatchClient.send
        .mockRejectedValueOnce(new Error('Invalid job definition: codec-converter-dev-small'))
        .mockResolvedValueOnce({});

      const request = new NextRequest('http://localhost/api/jobs/test-job-batch-fallback/submit', {
        method: 'POST',
      });

      // Execute
      const response = await POST(request, { params: Promise.resolve({ jobId }) });
      const data = await response.json();

      // Verify
      expect(response.status).toBe(200);
      expect(data.jobId).toBe(jobId);
      expect(mockBatchClient.send).toHaveBeenCalledTimes(2);
      // Second call should use medium
      expect(mockBatchClient.send).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          input: expect.objectContaining({
            jobDefinition: 'codec-converter-dev-medium',
          }),
        })
      );
    });

    it('should throw error when Batch submit fails for non-job-definition reasons', async () => {
      // Setup
      const jobId = 'test-job-batch-error';
      const mockJob = {
        jobId,
        status: 'PENDING',
        fileSize: 50 * 1024 * 1024,
        outputCodec: 'h264',
        inputFile: 'input/test.mp4',
      };

      mockDocClient.send.mockResolvedValueOnce({ Item: mockJob });
      mockS3Client.send.mockResolvedValueOnce({});
      mockSelectJobDefinition.mockReturnValue('small');
      mockBatchClient.send.mockRejectedValueOnce(new Error('Service unavailable'));

      const request = new NextRequest('http://localhost/api/jobs/test-job-batch-error/submit', {
        method: 'POST',
      });

      // Execute
      const response = await POST(request, { params: Promise.resolve({ jobId }) });
      const data = await response.json();

      // Verify
      expect(response.status).toBe(500);
      expect(data.error).toBe('INTERNAL_SERVER_ERROR');
      expect(mockBatchClient.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('Existing Error Cases', () => {
    it('should return 404 when job is not found', async () => {
      // Setup
      const jobId = 'non-existent-job';
      mockDocClient.send.mockResolvedValueOnce({ Item: undefined });

      const request = new NextRequest('http://localhost/api/jobs/non-existent-job/submit', {
        method: 'POST',
      });

      // Execute
      const response = await POST(request, { params: Promise.resolve({ jobId }) });
      const data = await response.json();

      // Verify
      expect(response.status).toBe(404);
      expect(data.error).toBe('JOB_NOT_FOUND');
      expect(data.message).toBe('指定されたジョブが見つかりません');
    });

    it('should return 409 when job is not in PENDING status', async () => {
      // Setup
      const jobId = 'test-job-processing';
      const mockJob = {
        jobId,
        status: 'PROCESSING',
        fileSize: 50 * 1024 * 1024,
        outputCodec: 'h264',
        inputFile: 'input/test.mp4',
      };

      mockDocClient.send.mockResolvedValueOnce({ Item: mockJob });

      const request = new NextRequest('http://localhost/api/jobs/test-job-processing/submit', {
        method: 'POST',
      });

      // Execute
      const response = await POST(request, { params: Promise.resolve({ jobId }) });
      const data = await response.json();

      // Verify
      expect(response.status).toBe(409);
      expect(data.error).toBe('INVALID_STATUS');
      expect(data.message).toBe('ジョブは既に実行中または完了しています');
    });

    it('should return 404 when input file is not found in S3', async () => {
      // Setup
      const jobId = 'test-job-no-file';
      const mockJob = {
        jobId,
        status: 'PENDING',
        fileSize: 50 * 1024 * 1024,
        outputCodec: 'h264',
        inputFile: 'input/test.mp4',
      };

      mockDocClient.send.mockResolvedValueOnce({ Item: mockJob });
      mockS3Client.send.mockRejectedValueOnce(new Error('Not found'));

      const request = new NextRequest('http://localhost/api/jobs/test-job-no-file/submit', {
        method: 'POST',
      });

      // Execute
      const response = await POST(request, { params: Promise.resolve({ jobId }) });
      const data = await response.json();

      // Verify
      expect(response.status).toBe(404);
      expect(data.error).toBe('FILE_NOT_FOUND');
      expect(data.message).toBe('入力ファイルが見つかりません');
    });
  });
});
