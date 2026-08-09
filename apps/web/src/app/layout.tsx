import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { Header } from '@/components/layout/header';
import { PageContainer } from '@/components/layout/page-container';

export const metadata: Metadata = {
  title: 'CarePoint Clinic | Voice Appointments',
  description: 'Book doctor appointments by voice or online at CarePoint Clinic.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeProvider>
          <Header />
          <PageContainer>{children}</PageContainer>
        </ThemeProvider>
      </body>
    </html>
  );
}
