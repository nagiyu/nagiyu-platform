import type { Metadata } from 'next';
import { Container, Typography, Box, Link } from '@mui/material';
import { liveTalkTermsSections, LIVETALK_TERMS_VERSION } from '@/lib/legal/terms-data';

export const metadata: Metadata = {
  title: '利用規約 | リブトーク',
  description: 'リブトーク（LiveTalk）の利用規約です。',
};

export default function TermsPage() {
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        利用規約
      </Typography>
      <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 4 }}>
        バージョン {LIVETALK_TERMS_VERSION}
      </Typography>

      {liveTalkTermsSections.map((section, sectionIndex) => (
        <Box key={sectionIndex} sx={{ mb: 4 }}>
          <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
            {section.title}
          </Typography>
          {section.contents.map((content, contentIndex) => (
            <Box key={contentIndex} sx={{ mb: 2 }}>
              <Typography variant="body1" sx={{ mb: 1, whiteSpace: 'pre-wrap' }}>
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

      <Box sx={{ mt: 4, pt: 2, borderTop: 1, borderColor: 'divider' }}>
        <Link href="/legal/privacy" variant="body2">
          プライバシーポリシーを見る
        </Link>
      </Box>
    </Container>
  );
}
