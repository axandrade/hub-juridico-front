import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/**
 * Preset PrimeNG derivado da paleta botânica (rouge / burgundy / creme).
 * Aplicado em `app.config.ts` via `providePrimeNG`.
 */
export const HubJuridicoPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#fbf0f1',
      100: '#f3d6da',
      200: '#e8b4b8',
      300: '#d98a91',
      400: '#c85c5c',
      500: '#8d2a3a',
      600: '#7c2333',
      700: '#5d1a26',
      800: '#3f131b',
      900: '#2b0f12',
      950: '#1c090c',
    },
    colorScheme: {
      light: {
        surface: {
          0: '#ffffff',
          50: '#f4f1de',
          100: '#efe9d2',
          200: '#e6dcbc',
          300: '#d8caa2',
          400: '#b9a986',
          500: '#8d2a3a',
          600: '#7c2333',
          700: '#5d1a26',
          800: '#3f131b',
          900: '#2b0f12',
          950: '#1c090c',
        },
        primary: {
          color: '#8d2a3a',
          contrastColor: '#f4f1de',
          hoverColor: '#7c2333',
          activeColor: '#5d1a26',
        },
      },
    },
  },
});
