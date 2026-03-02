'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { usePathname, useRouter } from 'next/navigation';

const navItems = [
    {
        id: 'chat', label: 'Chat', href: '/', icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
        )
    },
    {
        id: 'workout', label: 'Workouts', href: '/workout', icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6.5 6.5h11M6 12h12M17.5 17.5h-11" />
                <circle cx="4" cy="6.5" r="2.5" /><circle cx="20" cy="6.5" r="2.5" />
                <circle cx="4" cy="17.5" r="2.5" /><circle cx="20" cy="17.5" r="2.5" />
                <rect x="2" y="10" width="4" height="4" rx="1" /><rect x="18" y="10" width="4" height="4" rx="1" />
            </svg>
        )
    },
    {
        id: 'settings', label: 'Settings', href: '/settings', icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
        )
    },
    {
        id: 'account', label: 'Account', href: '/account', icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
            </svg>
        )
    },
];

export default function AppShell({ children }) {
    const { user, loading, signOut } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const pathname = usePathname();
    const router = useRouter();

    if (loading) {
        return (
            <div className="app-loader">
                <div className="spinner" style={{ width: 28, height: 28 }} />
            </div>
        );
    }

    if (!user) return null;

    return (
        <div className="app-shell">
            {/* Top NavBar — Hakika-style */}
            <nav className="top-nav">
                <div className="top-nav-inner">
                    <div className="top-nav-left">
                        <a href="/" className="top-nav-brand">
                            <img src="/cesy-logo.png" alt="Cesy" className="top-nav-logo-img" />
                            <span className="top-nav-title">Cesy</span>
                        </a>
                        {/* Desktop nav links */}
                        <div className="desktop-nav">
                            {navItems.map((item) => (
                                <button
                                    key={item.id}
                                    className={`desktop-nav-item${pathname === item.href ? ' desktop-nav-active' : ''}`}
                                    onClick={() => router.push(item.href)}
                                >
                                    {item.icon}
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="top-nav-right">
                        <button className="top-nav-btn" onClick={toggleTheme} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
                            {theme === 'dark' ? (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
                            ) : (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
                            )}
                        </button>
                        <div className="top-nav-divider" />
                        <button className="top-nav-btn top-nav-btn-danger" onClick={signOut} title="Sign out">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                            </svg>
                        </button>
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <main className="app-main">
                {children}
            </main>

            {/* Bottom Tab Bar — Mobile Only */}
            <nav className="bottom-tabs">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        className={`tab-item${pathname === item.href ? ' tab-active' : ''}`}
                        onClick={() => router.push(item.href)}
                    >
                        <span className="tab-icon">{item.icon}</span>
                        <span className="tab-label">{item.label}</span>
                    </button>
                ))}
            </nav>
        </div>
    );
}
