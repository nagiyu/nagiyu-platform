import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Admin Dashboard',
  description: 'Admin サービス管理画面',
};

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
