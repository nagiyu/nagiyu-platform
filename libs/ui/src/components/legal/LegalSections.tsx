'use client';

import { Typography, Box } from '@mui/material';
import Link from '../Link';
import type { LegalSection } from '../../types/legal';

export interface LegalSectionsProps {
  /**
   * 描画する条文。条番号は配列の並び順から採番する
   */
  sections: LegalSection[];
}

/**
 * 利用規約・プライバシーポリシーの条文を描画する。
 * 規約とポリシーで見た目を揃えるため、ダイアログとページはこの部品を共有する。
 */
export default function LegalSections({ sections }: LegalSectionsProps) {
  return (
    <>
      {sections.map((section, sectionIndex) => (
        <Box key={sectionIndex} sx={{ mb: 4 }}>
          <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
            第{sectionIndex + 1}条（{section.title}）
          </Typography>
          {section.contents.map((content, contentIndex) => (
            <Box key={contentIndex} sx={{ mb: 2 }}>
              {/* 本文中の \n を改行として表示するため pre-wrap を当てる */}
              <Typography variant="body1" sx={{ mb: 2, whiteSpace: 'pre-wrap' }}>
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
    </>
  );
}
