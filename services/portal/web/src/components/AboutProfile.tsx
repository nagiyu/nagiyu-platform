'use client';

import { Box, Typography } from '@mui/material';
import { Link } from '@nagiyu/ui';
import { AUTHOR } from '@/lib/author';
import { SKILLS } from '@/lib/about';

/**
 * About ページの「運営者プロフィール」セクション
 *
 * 運営者の背景・主要スキル・作ってきたもののサマリを表示する。
 * 個人情報（本名・住所・連絡先）は掲載しない。
 */
export default function AboutProfile() {
  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
        運営者プロフィール
      </Typography>

      <Typography variant="body1" sx={{ mb: 2 }}>
        私は <strong>{AUTHOR.name}</strong>（個人開発者）です。 AWS と Next.js
        を中心としたフルスタック開発を行っており、設計・実装・インフラ構築・運用までを一人でこなしています。
        個人開発のモノレポ「nagiyu-platform」で複数のプロダクトを設計・運用しており、そこで得た知見をこの技術メディアで発信しています。
      </Typography>

      <Typography variant="body1" sx={{ mb: 2 }}>
        開発の主な動機は「自分で使いたいものを自分で作る」ことです。
        実際にプロダクトを運用する中で直面した設計判断やトラブルシュートを、技術記事として一次情報で記録しています。
        掲載する記事はすべて自分の実装・運用経験に基づくものです。
      </Typography>

      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
          主要スキル・専門領域
        </Typography>
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          {SKILLS.map((skill) => (
            <Box
              key={skill.label}
              component="span"
              sx={{
                display: 'inline-block',
                px: 1.5,
                py: 0.5,
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                fontSize: '0.8125rem',
                color: 'text.secondary',
                bgcolor: 'background.paper',
              }}
            >
              {skill.label}
            </Box>
          ))}
        </Box>
      </Box>

      <Typography variant="body2" color="text.secondary">
        GitHub:{' '}
        <Link
          href="https://github.com/nagiyu/nagiyu-platform"
          target="_blank"
          rel="noopener noreferrer"
        >
          nagiyu/nagiyu-platform
        </Link>
      </Typography>
    </Box>
  );
}
