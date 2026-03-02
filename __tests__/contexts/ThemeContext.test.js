/**
 * Tests for ThemeContext
 */
import React from 'react';
import { render, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';

// Mock localStorage
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: jest.fn((key) => store[key] ?? null),
        setItem: jest.fn((key, value) => { store[key] = value; }),
        clear: jest.fn(() => { store = {}; }),
        removeItem: jest.fn((key) => { delete store[key]; }),
    };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Test consumer component
function ThemeConsumer() {
    const { theme, toggleTheme, setTheme } = useTheme();
    return (
        <div>
            <span data-testid="theme">{theme}</span>
            <button data-testid="toggle" onClick={toggleTheme}>Toggle</button>
            <button data-testid="set-light" onClick={() => setTheme('light')}>Light</button>
        </div>
    );
}

describe('ThemeContext', () => {
    beforeEach(() => {
        localStorageMock.clear();
        document.documentElement.removeAttribute('data-theme');
    });

    it('defaults to dark theme', () => {
        const { getByTestId } = render(
            <ThemeProvider><ThemeConsumer /></ThemeProvider>
        );
        expect(getByTestId('theme').textContent).toBe('dark');
    });

    it('reads theme from localStorage', () => {
        localStorageMock.getItem.mockReturnValueOnce('false'); // isDarkMode = false → light
        const { getByTestId } = render(
            <ThemeProvider><ThemeConsumer /></ThemeProvider>
        );
        // After useEffect runs
        expect(getByTestId('theme').textContent).toBe('light');
    });

    it('toggles theme', () => {
        const { getByTestId } = render(
            <ThemeProvider><ThemeConsumer /></ThemeProvider>
        );
        act(() => getByTestId('toggle').click());
        expect(getByTestId('theme').textContent).toBe('light');
        expect(localStorageMock.setItem).toHaveBeenCalledWith('cesy_dark_mode', 'false');
    });

    it('sets theme directly', () => {
        const { getByTestId } = render(
            <ThemeProvider><ThemeConsumer /></ThemeProvider>
        );
        act(() => getByTestId('set-light').click());
        expect(getByTestId('theme').textContent).toBe('light');
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    it('throws when useTheme is used outside provider', () => {
        const spy = jest.spyOn(console, 'error').mockImplementation(() => { });
        expect(() => render(<ThemeConsumer />)).toThrow('useTheme must be used within ThemeProvider');
        spy.mockRestore();
    });
});
