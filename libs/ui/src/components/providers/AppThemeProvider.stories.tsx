import type { Meta, StoryObj } from '@storybook/react-vite';
import { Box, Typography } from '@mui/material';
import AppThemeProvider from './AppThemeProvider';

const meta: Meta<typeof AppThemeProvider> = {
  title: 'Providers/AppThemeProvider',
  component: AppThemeProvider,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'ServiceLayout を採用しないサービス向けの軽量 Provider。AppRouterCacheProvider + ThemeProvider + CssBaseline を一括で提供する。',
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof AppThemeProvider>;

export const Default: Story = {
  render: () => (
    <AppThemeProvider>
      <Box sx={{ p: 4 }}>
        <Typography variant="h4" gutterBottom>
          AppThemeProvider 配下のコンテンツ
        </Typography>
        <Typography variant="body1">
          MUI テーマ・CssBaseline・AppRouterCacheProvider が適用されます。
        </Typography>
      </Box>
    </AppThemeProvider>
  ),
};
