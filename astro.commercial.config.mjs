import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://demos.mrsoftware.dk',
  srcDir: './commercial/src', publicDir: './commercial/public',
  outDir: './.commercial-dist', output: 'static', trailingSlash: 'always',
  build: { format: 'directory' },
});
