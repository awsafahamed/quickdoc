import type { Metadata, Viewport } from 'next';
import './styles.css';
import { SessionRefresh } from './session-refresh';

export const metadata: Metadata = {
  title: 'QuickDoc | Print and Document Services',
  description: 'Choose print options, arrange delivery from eligible print shops, and explore document return services with QuickDoc.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><SessionRefresh access="print-attest-access-token" refresh="print-attest-refresh-token" signInPath="/login" />{children}</body>
    </html>
  );
}
