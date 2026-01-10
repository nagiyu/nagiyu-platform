import { render, screen } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { Button } from '@mui/material';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

function TestComponent() {
  const router = useRouter();
  return (
    <Button onClick={() => (router as any).push('/test')}>
      Click Me
    </Button>
  );
}

describe('Next.js Router Test', () => {
  it('should render a component using useRouter', () => {
    const mockPush = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
    
    const theme = createTheme();
    render(
      <ThemeProvider theme={theme}>
        <TestComponent />
      </ThemeProvider>
    );
    
    expect(screen.getByRole('button', { name: 'Click Me' })).toBeInTheDocument();
  });
});
