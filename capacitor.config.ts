import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yonimeir.familyshopping',
  appName: 'אין כלום בבית',
  webDir: 'dist',
  server: {
    url: 'https://yonimeir.github.io/family-shopping/',
    cleartext: false,
    allowNavigation: ['yonimeir.github.io'],
  },
  android: {
    backgroundColor: '#FAF8F4',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
