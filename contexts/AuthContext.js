'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { initializeFirebase, googleProvider, appleProvider } from '@/lib/firebase';
import {
    signInWithPopup,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    updateProfile,
} from 'firebase/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let unsubscribe;

        async function init() {
            try {
                const { auth } = await initializeFirebase();
                unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
                    if (firebaseUser) {
                        setUser({
                            uid: firebaseUser.uid,
                            email: firebaseUser.email,
                            displayName: firebaseUser.displayName,
                            photoURL: firebaseUser.photoURL,
                        });
                        // Ensure user profile exists in our database
                        try {
                            await fetch('/api/auth/sync', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    firebaseUid: firebaseUser.uid,
                                    email: firebaseUser.email,
                                    fullName: firebaseUser.displayName,
                                    avatarUrl: firebaseUser.photoURL,
                                }),
                            });
                        } catch (e) {
                            console.error('Failed to sync user profile:', e);
                        }
                    } else {
                        setUser(null);
                    }
                    setLoading(false);
                });
            } catch (e) {
                console.error('Firebase init error:', e);
                setLoading(false);
            }
        }

        init();
        return () => unsubscribe?.();
    }, []);

    const signInWithGoogle = useCallback(async () => {
        setError(null);
        try {
            const { auth } = await initializeFirebase();
            await signInWithPopup(auth, googleProvider);
        } catch (e) {
            setError(e.message);
            throw e;
        }
    }, []);

    const signInWithApple = useCallback(async () => {
        setError(null);
        try {
            const { auth } = await initializeFirebase();
            await signInWithPopup(auth, appleProvider);
        } catch (e) {
            setError(e.message);
            throw e;
        }
    }, []);

    const signInWithEmail = useCallback(async (email, password) => {
        setError(null);
        try {
            const { auth } = await initializeFirebase();
            await signInWithEmailAndPassword(auth, email, password);
        } catch (e) {
            setError(e.message);
            throw e;
        }
    }, []);

    const createAccount = useCallback(async (name, email, password) => {
        setError(null);
        try {
            const { auth } = await initializeFirebase();
            const result = await createUserWithEmailAndPassword(auth, email, password);
            await updateProfile(result.user, { displayName: name });
            setUser((prev) => ({ ...prev, displayName: name }));
        } catch (e) {
            setError(e.message);
            throw e;
        }
    }, []);

    const signOut = useCallback(async () => {
        try {
            const { auth } = await initializeFirebase();
            await firebaseSignOut(auth);
            setUser(null);
        } catch (e) {
            setError(e.message);
        }
    }, []);

    return (
        <AuthContext.Provider
            value={{
                user,
                loading,
                error,
                signInWithGoogle,
                signInWithApple,
                signInWithEmail,
                createAccount,
                signOut,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
