import type { Metadata } from 'next';
import { Container, Typography, Box } from '@mui/material';
import { termSections } from '@nagiyu/ui';

export const metadata: Metadata = {
  title: '利用規約 - Tools',
  description: 'Tools の利用規約',
  alternates: {
    canonical: 'https://nagiyu.com/terms',
  },
};

export default function TermsPage() {
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        利用規約
      </Typography>

      {termSections.map((section, sectionIndex) => (
        <Box key={sectionIndex} sx={{ mb: 4 }}>
          <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
            第{sectionIndex + 1}条（{section.title}）
          </Typography>
          {section.contents.map((content, contentIndex) => (
            <Box key={contentIndex} sx={{ mb: 2 }}>
              <Typography variant="body1" paragraph>
                {content.mainContent}
              </Typography>
              {content.subItems && (
                <Box component="ol" sx={{ pl: 3, mt: 1 }}>
                  {content.subItems.map((item, itemIndex) => (
                    <Box component="li" key={itemIndex} sx={{ mb: 1 }}>
                      <Typography variant="body2">{item}</Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          ))}
        </Box>
      ))}
    </Container>
  );
}
