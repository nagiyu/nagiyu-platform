import { render, screen } from '@testing-library/react';
import StudyStatusBadge from '@/components/StudyStatusBadge';
import { useStudyStatus } from '@/lib/study/useStudyStatus';

jest.mock('@/lib/study/useStudyStatus', () => ({ useStudyStatus: jest.fn() }));
const mockUseStudyStatus = useStudyStatus as jest.MockedFunction<typeof useStudyStatus>;

const AUTH_URL = 'https://auth.example.com';

describe('StudyStatusBadge', () => {
  it('取得前 (null) は何も出さない', () => {
    mockUseStudyStatus.mockReturnValue(null);
    render(<StudyStatusBadge authUrl={AUTH_URL} />);
    expect(screen.queryByTestId('study-status-badge')).not.toBeInTheDocument();
  });

  it('hidden は何も出さない', () => {
    mockUseStudyStatus.mockReturnValue({ state: 'hidden' });
    render(<StudyStatusBadge authUrl={AUTH_URL} />);
    expect(screen.queryByTestId('study-status-badge')).not.toBeInTheDocument();
  });

  it('お試し中は残り日数を出し、リンクにしない', () => {
    mockUseStudyStatus.mockReturnValue({ state: 'trial', remainingDays: 5 });
    render(<StudyStatusBadge authUrl={AUTH_URL} />);
    expect(screen.getByText('お試し中 あと 5 日')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('お休み中はプランの画面へのリンクになる', () => {
    mockUseStudyStatus.mockReturnValue({ state: 'ended' });
    render(<StudyStatusBadge authUrl={AUTH_URL} />);
    expect(screen.getByRole('link', { name: '勉強はお休み中' })).toHaveAttribute(
      'href',
      'https://auth.example.com/plans'
    );
  });

  it('auth の URL が空のお休み中は、リンクにしない', () => {
    mockUseStudyStatus.mockReturnValue({ state: 'ended' });
    render(<StudyStatusBadge authUrl="" />);
    expect(screen.getByText('勉強はお休み中')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
