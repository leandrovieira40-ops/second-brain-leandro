import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { ThemeProvider } from '@/components/theme-provider';
import { readAppConfig } from '@/lib/config/env';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const { appName } = readAppConfig();
  return {
    title: { default: appName, template: `%s · ${appName}` },
    description: 'Base pessoal de conhecimento.',
    robots: { index: false, follow: false, nocache: true },
    referrer: 'no-referrer',
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfaf8' },
    { media: '(prefers-color-scheme: dark)', color: '#1b1c20' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Nonce gerado pelo proxy.ts para o script inline do next-themes (CSP sem 'unsafe-inline').
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
