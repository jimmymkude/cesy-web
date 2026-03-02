import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, OAuthProvider } from 'firebase/auth';

let app = null;
let auth = null;

/**
 * Initialize Firebase with config fetched from Supabase (mirrors iOS pattern).
 * Falls back to env vars if Supabase fetch fails.
 */
export async function initializeFirebase(config = null) {
    if (getApps().length > 0) {
        app = getApps()[0];
        auth = getAuth(app);
        return { app, auth };
    }

    const firebaseConfig = config || {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
        measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
    };

    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    return { app, auth };
}

export function getFirebaseAuth() {
    if (!auth) {
        throw new Error('Firebase not initialized. Call initializeFirebase() first.');
    }
    return auth;
}

export const googleProvider = new GoogleAuthProvider();
export const appleProvider = new OAuthProvider('apple.com');
appleProvider.addScope('email');
appleProvider.addScope('name');
