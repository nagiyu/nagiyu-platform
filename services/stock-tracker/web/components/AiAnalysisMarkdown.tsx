'use client';

import { Box, Typography, type SxProps, type Theme } from '@mui/material';
import { Link } from '@nagiyu/ui';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface AiAnalysisMarkdownProps {
  content: string;
  sx?: SxProps<Theme>;
}

export const MARKDOWN_COMPONENTS: Components = {
  p: ({ children }) => (
    <Typography component="p" sx={{ mb: 1, '&:last-child': { mb: 0 } }}>
      {children}
    </Typography>
  ),
  a: ({ children, href }) => (
    <Link href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </Link>
  ),
  ul: ({ children }) => (
    <Box component="ul" sx={{ pl: 3, mb: 1, '&:last-child': { mb: 0 } }}>
      {children}
    </Box>
  ),
  ol: ({ children }) => (
    <Box component="ol" sx={{ pl: 3, mb: 1, '&:last-child': { mb: 0 } }}>
      {children}
    </Box>
  ),
  li: ({ children }) => (
    <Typography component="li" sx={{ mb: 0.25 }}>
      {children}
    </Typography>
  ),
  strong: ({ children }) => (
    <Box component="strong" sx={{ fontWeight: 'bold' }}>
      {children}
    </Box>
  ),
  em: ({ children }) => (
    <Box component="em" sx={{ fontStyle: 'italic' }}>
      {children}
    </Box>
  ),
  code: ({ children }) => (
    <Box
      component="code"
      sx={{
        bgcolor: 'grey.100',
        px: 0.5,
        borderRadius: 0.5,
        fontFamily: 'monospace',
        fontSize: '0.875em',
      }}
    >
      {children}
    </Box>
  ),
  h1: ({ children }) => (
    <Typography variant="subtitle1" component="h3" sx={{ mt: 1, mb: 0.5, fontWeight: 'bold' }}>
      {children}
    </Typography>
  ),
  h2: ({ children }) => (
    <Typography variant="subtitle1" component="h4" sx={{ mt: 1, mb: 0.5, fontWeight: 'bold' }}>
      {children}
    </Typography>
  ),
  h3: ({ children }) => (
    <Typography variant="subtitle2" component="h5" sx={{ mt: 1, mb: 0.5, fontWeight: 'bold' }}>
      {children}
    </Typography>
  ),
};

export default function AiAnalysisMarkdown({ content, sx }: AiAnalysisMarkdownProps) {
  return (
    <Box
      sx={[
        { wordBreak: 'break-word', overflowWrap: 'anywhere' },
        ...(sx == null ? [] : Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
        {content}
      </ReactMarkdown>
    </Box>
  );
}
