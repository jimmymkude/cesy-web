'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { usePathname, useRouter } from 'next/navigation';

const navItems = [
    { id: 'chat', label: 'Chat', icon: '💬', href: '/' },
    { id: 'workout', label: 'Workouts', icon: '🏋️', href: '/workout' },
    { id: 'settings', label: 'Settings', icon: '⚙️', href: '/settings' },
    { id: 'account', label: 'Account', icon: '👤', href: '/account' },
];

export default function Sidebar({ isOpen, onClose }) {
    const { user, signOut } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const pathname = usePathname();
    const router = useRouter();

    const handleNav = (href) => {
        router.push(href);
        onClose?.();
    };

    const initials = user?.displayName
        ? user.displayName.split(' ').map((n) => n[0]).join('').toUpperCase()
        : user?.email?.[0]?.toUpperCase() || '?';

    return (
        <>
            {isOpen && (
                <div
                    className="sidebar-overlay"
                    onClick={onClose}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.5)',
                        zIndex: 99,
                    }}
                />
            )}
            <aside className={`sidebar${isOpen ? ' open' : ''}`}>
                <div className="sidebar-header">
                    <div className="sidebar-logo">
                        <div className="sidebar-logo-icon">C</div>
                        <span className="sidebar-logo-text">Cesy</span>
                    </div>
                </div>

                <nav className="sidebar-nav">
                    <div className="nav-section-title">Menu</div>
                    {navItems.map((item) => (
                        <button
                            key={item.id}
                            className={`nav-item${pathname === item.href ? ' active' : ''}`}
                            onClick={() => handleNav(item.href)}
                        >
                            <span>{item.icon}</span>
                            <span>{item.label}</span>
                        </button>
                    ))}

                    <div className="nav-section-title" style={{ marginTop: 'auto' }}>Preferences</div>
                    <button className="nav-item" onClick={toggleTheme}>
                        <span>{theme === 'dark' ? '☀️' : '🌙'}</span>
                        <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                    </button>
                </nav>

                <div className="sidebar-footer">
                    <div className="user-card" onClick={() => handleNav('/account')}>
                        <div className="user-avatar">
                            {user?.photoURL ? (
                                <img
                                    src={user.photoURL}
                                    alt=""
                                    style={{ width: '100%', height: '100%', borderRadius: 'inherit', objectFit: 'cover' }}
                                />
                            ) : (
                                initials
                            )}
                        </div>
                        <div className="user-info">
                            <div className="user-name">{user?.displayName || 'User'}</div>
                            <div className="user-email">{user?.email}</div>
                        </div>
                    </div>
                    <button
                        className="nav-item"
                        style={{ marginTop: 'var(--space-2)', color: 'var(--color-error)' }}
                        onClick={signOut}
                    >
                        <span>🚪</span>
                        <span>Sign Out</span>
                    </button>
                </div>
            </aside>
        </>
    );
}
