import type { Metadata } from 'next';
import './styles.css';

export const metadata: Metadata = {
  title: 'QuickDoc | Print and Document Services',
  description: 'Choose print options, arrange delivery from eligible print shops, and explore document return services with QuickDoc.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
