// Firebase configuration
// Replace these values with your own Firebase project config
// Get them from: Firebase Console > Project Settings > Your apps > Web app
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || '';
const databaseURL =
  import.meta.env.VITE_FIREBASE_DATABASE_URL ||
  (projectId ? `https://${projectId}-default-rtdb.firebaseio.com` : '');

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  ...(databaseURL ? { databaseURL } : {}),
};

export default firebaseConfig;

export function isFirebaseConfigured(): boolean {
  return !!(firebaseConfig.apiKey && firebaseConfig.projectId);
}
