'use client';

import { Card, CardActionArea, CardContent, Typography } from '@mui/material';
import Link from 'next/link';

type GroupCardProps = {
  name: string;
  memberCount: number;
  href?: string;
  onClick?: () => void;
};

export function GroupCard({ name, memberCount, href, onClick }: GroupCardProps) {
  return (
    <Card>
      {href ? (
        <CardActionArea component={Link} href={href}>
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
        <CardActionArea component="button" onClick={onClick} type="button">
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
