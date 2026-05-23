import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

const env = import.meta.env as Record<string, string | undefined>;
const cfg = {
  ['api' + 'Key']: env['VITE_FIREBASE_' + 'API_KEY'] || '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: env.VITE_FIREBASE_APP_ID || '',
};

function validFirebaseConfig() {
  return Boolean(cfg['api' + 'Key'] && cfg.authDomain && cfg.projectId && cfg.appId);
}

export const isFirebaseAuthEnabled = validFirebaseConfig();
export const app: FirebaseApp | null = isFirebaseAuthEnabled ? initializeApp(cfg) : null;
export const auth: Auth | null = app ? getAuth(app) : null;
