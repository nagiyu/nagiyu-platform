'use client';

import { Card, CardActionArea, CardContent, Typography } from '@mui/material';
import Link from 'next/link';

type GroupCardProps = {
  name: string;
  memberCount: number;
  href?: string;
  /** 一覧で選択中のカード。枠線で強調し、支援技術には現在の項目として伝える。 */
  selected?: boolean;
  onClick?: () => void;
};

export function GroupCard({ name, memberCount, href, selected = false, onClick }: GroupCardProps) {
  const ariaCurrent = selected ? 'true' : undefined;

  return (
    // 選択の切り替えでカードの大きさが変わらないよう、非選択でも同じ太さの透明な枠を持たせる。
    <Card sx={{ border: 2, borderColor: selected ? 'primary.main' : 'transparent' }}>
      {href ? (
        <CardActionArea component={Link} href={href} aria-current={ariaCurrent}>
          <CardContent>
            <Typography variant="h6" component="h2">
              {name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              メンバー数: {memberCount}
            </Typography>
          </CardContent>
        </CardActionArea>
      ) : (
        <CardActionArea
          component="button"
          onClick={onClick}
          type="button"
          aria-current={ariaCurrent}
        >
          <CardContent>
            <Typography variant="h6" component="h2">
              {name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              メンバー数: {memberCount}
            </Typography>
          </CardContent>
        </CardActionArea>
      )}
    </Card>
  );
}
