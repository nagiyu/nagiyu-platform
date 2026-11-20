import { Box, Typography } from '@mui/material';
import type { LegalRevision } from '@/lib/legal/revisions';

export interface LegalRevisionHistoryProps {
  /** 古い版から新しい版の順 */
  revisions: LegalRevision[];
}

/**
 * 法務ページの末尾に出す改定履歴。新しい版を上にして並べる。
 * 条文本体の外に置き、条番号を振る LegalSections には含めない。
 */
export default function LegalRevisionHistory({ revisions }: LegalRevisionHistoryProps) {
  const newestFirst = [...revisions].reverse();

  return (
    <Box component="section" sx={{ mt: 4 }} data-testid="legal-revision-history">
      <Typography variant="h6" component="h2" gutterBottom>
        改定履歴
      </Typography>
      {newestFirst.map((revision) => (
        <Box key={revision.version} sx={{ mb: 2 }}>
          <Typography variant="subtitle2" component="h3">
            バージョン {revision.version}（{revision.effectiveDate}施行）
          </Typography>
          <Box component="ul" sx={{ my: 0.5, pl: 3, fontSize: '0.875rem' }}>
            {revision.summary.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
