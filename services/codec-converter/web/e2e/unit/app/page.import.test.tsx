import { render, screen } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

// Mock fetch
global.fetch = jest.fn();

describe('Import Page Test', () => {
  it('should import and render the Home page', async () => {
    const mockPush = jest.fn();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
    
    // Dynamic import to avoid the module-level issue
    const { default: Home } = await import('../../../src/app/page');
    
    const theme = createTheme();
    render(
      <ThemeProvider theme={theme}>
        <Home />
      </ThemeProvider>
    );
    
    expect(screen.getByRole('heading', { name: 'Codec Converter' })).toBeInTheDocument();
  });
});
