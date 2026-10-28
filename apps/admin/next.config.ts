import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const config: NextConfig = {
  transpilePackages: ['@sammly/shared', '@sammly/template-schema', '@sammly/renderer-html'],
};

export default withNextIntl(config);
