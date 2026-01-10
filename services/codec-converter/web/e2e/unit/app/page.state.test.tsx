import { render, screen } from '@testing-library/react';
import { useState } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { Button } from '@mui/material';

function TestComponent() {
  const [count, setCount] = useState(0);
  return (
    <Button onClick={() => setCount(count + 1)}>
      Count: {count}
    </Button>
  );
}

describe('useState Test', () => {
  it('should render a component using useState', () => {
    const theme = createTheme();
    render(
      <ThemeProvider theme={theme}>
        <TestComponent />
      </ThemeProvider>
    );
    
    expect(screen.getByRole('button', { name: 'Count: 0' })).toBeInTheDocument();
  });
});
