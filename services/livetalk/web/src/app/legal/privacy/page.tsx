import type { Metadata } from 'next';
import { Container, Typography, Box, Link } from '@mui/material';
import { liveTalkPrivacySections, LIVETALK_PRIVACY_VERSION } from '@/lib/legal/privacy-data';

export const metadata: Metadata = {
  title: 'プライバシーポリシー | リブトーク',
  description: 'リブトーク（LiveTalk）のプライバシーポリシーです。',
};

export default function PrivacyPage() {
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        プライバシーポリシー
      </Typography>
      <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 4 }}>
        バージョン {LIVETALK_PRIVACY_VERSION}
      </Typography>

      {liveTalkPrivacySections.map((section, sectionIndex) => (
        <Box key={sectionIndex} sx={{ mb: 4 }}>
          <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
            {section.title}
          </Typography>
          {section.contents.map((content, contentIndex) => (
            <Box key={contentIndex} sx={{ mb: 2 }}>
              <Typography variant="body1" sx={{ mb: 1 }}>
                {content.mainContent}
              </Typography>
              {content.subContents && (
                <Box component="ol" sx={{ pl: 3, mt: 1 }}>
                  {content.subContents.map((sub, subIndex) => (
                    <Box component="li" key={subIndex} sx={{ mb: 1 }}>
                      <Typography variant="body2">{sub.subContent}</Typography>
                      {sub.subItems && (
                        <Box component="ol" sx={{ pl: 2, mt: 0.5 }}>
                          {sub.subItems.map((item, itemIndex) => (
                            <Box component="li" key={itemIndex} sx={{ mb: 0.5 }}>
                              <Typography variant="body2">{item}</Typography>
                            </Box>
                          ))}
                        </Box>
                      )}
                    </Box>
                  ))}
                </Box>
              )}
              {content.link && (
                <Typography variant="body2" sx={{ mt: 1 }}>
                  <Link href={content.link} target="_blank" rel="noopener noreferrer">
                    {content.link}
                  </Link>
                </Typography>
              )}
            </Box>
          ))}
        </Box>
      ))}

      <Box sx={{ mt: 4, pt: 2, borderTop: 1, borderColor: 'divider' }}>
        <Link href="/legal/terms" variant="body2">
          利用規約を見る
        </Link>
      </Box>
    </Container>
  );
}
