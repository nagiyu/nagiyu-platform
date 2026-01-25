import type { Metadata } from 'next';
import { Container, Typography, Box, Link } from '@mui/material';
import { privacyPolicySections } from '@nagiyu/ui';

export const metadata: Metadata = {
  title: 'プライバシーポリシー',
  description:
    'Toolsのプライバシーポリシーです。Google AdSenseの使用、Cookieの取り扱い、データの処理方法、個人情報の保護について詳しく説明します。',
  alternates: {
    canonical: 'https://nagiyu.com/privacy',
  },
};

export default function PrivacyPage() {
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        プライバシーポリシー
      </Typography>

      {privacyPolicySections.map((section, sectionIndex) => (
        <Box key={sectionIndex} sx={{ mb: 4 }}>
          <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
            第{sectionIndex + 1}条（{section.title}）
          </Typography>
          {section.contents.map((content, contentIndex) => (
            <Box key={contentIndex} sx={{ mb: 2 }}>
              <Typography variant="body1" paragraph>
                {content.mainContent}
              </Typography>
              {content.subContents && (
                <Box component="ol" sx={{ pl: 3, mt: 1 }}>
                  {content.subContents.map((subContent, subIndex) => (
                    <Box component="li" key={subIndex} sx={{ mb: 1 }}>
                      <Typography variant="body2">{subContent.subContent}</Typography>
                      {subContent.subItems && (
                        <Box component="ol" sx={{ pl: 2, mt: 0.5 }}>
                          {subContent.subItems.map((item, itemIndex) => (
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
    </Container>
  );
}
