'use client';

import { Box, Typography } from '@mui/material';
import { TARGET_READERS, POLICY_ITEMS } from '@/lib/about';

/**
 * About ページの「運営方針」セクション
 *
 * サイトの目的・対象読者・更新姿勢・コンテンツ信頼性への考え方を表示する。
 */
export default function AboutPolicy() {
  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
        運営方針
      </Typography>

      <Typography variant="body1" sx={{ mb: 2 }}>
        このサイトは、AWS・Next.js
        を主軸としたフルスタック開発の実運用経験を発信する個人技術メディアです。
        設計の意図と実装の詳細を、運用視点で一次情報として記録することをテーマにしています。
      </Typography>

      {/* 対象読者 */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
          こんな方に読んでほしい
        </Typography>
        <Box component="ul" sx={{ pl: 3, mt: 0 }}>
          {TARGET_READERS.map((reader, index) => (
            <Box key={index} component="li" sx={{ mb: 0.5 }}>
              <Typography variant="body2">{reader}</Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {/* 方針項目 */}
      <Box component="dl" sx={{ m: 0 }}>
        {POLICY_ITEMS.map((item, index) => (
          <Box key={index} sx={{ mb: 2 }}>
            <Typography component="dt" variant="body1" sx={{ fontWeight: 600, mb: 0.5 }}>
              {item.title}
            </Typography>
            <Typography component="dd" variant="body2" color="text.secondary" sx={{ ml: 0 }}>
              {item.description}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
