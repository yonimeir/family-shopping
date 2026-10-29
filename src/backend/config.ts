const env = import.meta.env;

export const firebaseConfig = {
  apiKey: (env.VITE_FIREBASE_API_KEY as string | undefined) || 'AIzaSyCpoRMPnXKp4OKLsKr2RiceGlgAGcPJKO0',
  authDomain: (env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) || 'mishna-yomit-7cecd.firebaseapp.com',
  projectId: (env.VITE_FIREBASE_PROJECT_ID as string | undefined) || 'mishna-yomit-7cecd',
  storageBucket: (env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined) || 'mishna-yomit-7cecd.firebasestorage.app',
  messagingSenderId: (env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined) || '826189234717',
  appId: (env.VITE_FIREBASE_APP_ID as string | undefined) || '1:826189234717:web:25b8737ca8d37162043cf4',
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
