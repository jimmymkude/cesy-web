'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from '@/components/Sidebar';

export default function AppShell({ children }) {
    const { user, loading } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    if (loading) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '100vh',
                background: 'var(--color-bg-primary)',
            }}>
                <div className="spinner" style={{ width: 32, height: 32 }} />
            </div>
        );
    }

    if (!user) {
        return null; // Login page handles itself
    }

    return (
        <div className="app-layout">
            <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            <main className="main-content">
                <div className="mobile-header">
                    <button
                        className="btn btn-ghost btn-icon hamburger-btn"
                        onClick={() => setSidebarOpen(true)}
                        aria-label="Open menu"
                    >
                        ☰
                    </button>
                    <span className="sidebar-logo-text" style={{ fontSize: 'var(--text-lg)' }}>
                        Cesy
                    </span>
                </div>
                {children}
            </main>
        </div>
    );
}
