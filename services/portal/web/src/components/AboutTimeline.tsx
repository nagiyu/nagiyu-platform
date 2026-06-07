'use client';

import { Box, Typography } from '@mui/material';
import { TIMELINE_EVENTS } from '@/lib/about';

/**
 * About ページの「運営期間・歴史」セクション
 *
 * プラットフォームの主要マイルストーンをタイムライン形式で表示する。
 * git log で確認できる初コミット（2026年5月）を起点とする。
 */
export default function AboutTimeline() {
  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
        運営期間・歴史
      </Typography>

      <Typography variant="body1" sx={{ mb: 3 }}>
        私が nagiyu-platform の開発を始めたのは 2026 年 5 月です。
        当初から「複数サービスを一元管理するモノレポ構成」を前提に設計しており、
        現在も継続的に開発・更新を続けています。
      </Typography>

      <Box
        component="ol"
        sx={{
          listStyle: 'none',
          pl: 0,
          m: 0,
          borderLeft: '2px solid',
          borderColor: 'primary.main',
          ml: 1,
        }}
      >
        {TIMELINE_EVENTS.map((event, index) => (
          <Box
            key={index}
            component="li"
            sx={{
              position: 'relative',
              pl: 3,
              pb: index < TIMELINE_EVENTS.length - 1 ? 3 : 0,
            }}
          >
            {/* タイムラインの丸マーカー */}
            <Box
              sx={{
                position: 'absolute',
                left: -7,
                top: 4,
                width: 12,
                height: 12,
                borderRadius: '50%',
                bgcolor: 'primary.main',
              }}
            />
            <Typography
              variant="caption"
              sx={{ fontWeight: 600, color: 'primary.main', display: 'block', mb: 0.5 }}
            >
              {event.period}
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 600, mb: 0.5 }}>
              {event.title}
            </Typography>
            {event.description && (
              <Typography variant="body2" color="text.secondary">
                {event.description}
              </Typography>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
