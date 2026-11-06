import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { AuthUrlProvider, useAuthUrl } from '@/components/AuthUrlProvider';

const Show = () => <span>{`url:${useAuthUrl()}`}</span>;

describe('AuthUrlProvider', () => {
  it('渡した auth の URL を子から読める', () => {
    render(
      <AuthUrlProvider authUrl="https://auth.example.com">
        <Show />
      </AuthUrlProvider>
    );
    expect(screen.getByText('url:https://auth.example.com')).toBeInTheDocument();
  });

  it('プロバイダが無ければ空文字', () => {
    render(<Show />);
    expect(screen.getByText('url:')).toBeInTheDocument();
  });
});
