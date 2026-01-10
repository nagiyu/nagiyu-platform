import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { Button } from '@mui/material';

// Simple test to verify Material-UI works
describe('Material-UI Simple Test', () => {
  it('should render a Material-UI button', () => {
    const theme = createTheme();
    render(
      <ThemeProvider theme={theme}>
        <Button>Test Button</Button>
      </ThemeProvider>
    );
    
    expect(screen.getByRole('button', { name: 'Test Button' })).toBeInTheDocument();
  });
});
