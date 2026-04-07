import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import JobPage from '@/app/jobs/[jobId]/page';

describe('JobPage', () => {
  it('COMPLETED 状態で見どころ確認ボタンを表示する', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        jobId: 'job-1',
        status: 'COMPLETED',
        originalFileName: 'movie.mp4',
        fileSize: 1024,
        createdAt: 1,
        expiresAt: 2,
      }),
    }) as jest.Mock;

    render(<JobPage params={Promise.resolve({ jobId: 'job-1' })} />);

    await waitFor(() => {
      expect(screen.getByText('ジョブID: job-1')).toBeInTheDocument();
    });

    expect(screen.getByRole('link', { name: '見どころを確認する' })).toBeInTheDocument();
  });
});
