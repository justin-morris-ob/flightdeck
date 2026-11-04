import { mergeConfig } from 'vite';

import { defineAtlasRemote } from '@onebrief/atlas-vite-config';

export default mergeConfig(defineAtlasRemote(), {
  base: process.env.ATLAS_FLIGHTDECK_URL
    ? `${process.env.ATLAS_FLIGHTDECK_URL.replace(/\/+$/, '')}/`
    : '/remote/',
  build: { outDir: 'dist/remote', emptyOutDir: true },
});
