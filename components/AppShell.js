'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { usePathname, useRouter } from 'next/navigation';
import { MessageSquare, Dumbbell, Brain, Settings, User, LogOut, Sun, Moon } from 'lucide-react';

const navItems = [
    {
        id: 'chat', label: 'Chat', href: '/', icon: <MessageSquare size={20} strokeWidth={2} />
    },
    {
        id: 'workout', label: 'Workouts', href: '/workout', icon: <Dumbbell size={20} strokeWidth={2} />
    },
    {
        id: 'memories', label: 'Memory', href: '/memories', icon: <Brain size={20} strokeWidth={2} />
    },
    {
        id: 'settings', label: 'Settings', href: '/settings', icon: <Settings size={20} strokeWidth={2} />
    },
    {
        id: 'account', label: 'Account', href: '/account', icon: <User size={20} strokeWidth={2} />
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
                                <Sun size={18} strokeWidth={2} />
                            ) : (
                                <Moon size={18} strokeWidth={2} />
                            )}
                        </button>
                        <div className="top-nav-divider" />
                        <button className="top-nav-btn top-nav-btn-danger" onClick={signOut} title="Sign out">
                            <LogOut size={18} strokeWidth={2} />
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
