/**
 * Tests for MessageBubble — copy button, link detection, retry, amazon carts
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import MessageBubble, { linkifyContent } from '@/components/MessageBubble';

// Mock clipboard API
const mockWriteText = jest.fn().mockResolvedValue(undefined);
Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: mockWriteText },
    writable: true,
    configurable: true,
});

describe('MessageBubble', () => {
    const mockUser = { displayName: 'Jimmy', photoURL: null };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders assistant message content', () => {
        const msg = { id: '1', role: 'assistant', content: 'Hello from Cesy!', createdAt: Date.now() };
        const { getByText } = render(<MessageBubble msg={msg} user={mockUser} />);
        expect(getByText('Hello from Cesy!')).toBeTruthy();
    });

    it('renders user message with first letter avatar', () => {
        const msg = { id: '2', role: 'user', content: 'Hi there', createdAt: Date.now() };
        const { getByText } = render(<MessageBubble msg={msg} user={mockUser} />);
        expect(getByText('J')).toBeTruthy(); // First letter of "Jimmy"
        expect(getByText('Hi there')).toBeTruthy();
    });

    it('renders C avatar for assistant messages', () => {
        const msg = { id: '3', role: 'assistant', content: 'Hey!', createdAt: Date.now() };
        const { getByText } = render(<MessageBubble msg={msg} user={mockUser} />);
        expect(getByText('C')).toBeTruthy();
    });

    it('shows copy button on the message bubble', () => {
        const msg = { id: '4', role: 'assistant', content: 'Copy me', createdAt: Date.now() };
        const { getByTitle } = render(<MessageBubble msg={msg} user={mockUser} />);
        expect(getByTitle('Copy message')).toBeTruthy();
    });

    it('copies text to clipboard on copy button click', async () => {
        const msg = { id: '5', role: 'assistant', content: 'Important info', createdAt: Date.now() };
        const { getByTitle } = render(<MessageBubble msg={msg} user={mockUser} />);

        fireEvent.click(getByTitle('Copy message'));

        await waitFor(() => {
            expect(mockWriteText).toHaveBeenCalledWith('Important info');
        });
    });

    it('shows "Copied!" toast after copying', async () => {
        const msg = { id: '6', role: 'assistant', content: 'Copy this', createdAt: Date.now() };
        const { getByTitle, getByText } = render(<MessageBubble msg={msg} user={mockUser} />);

        fireEvent.click(getByTitle('Copy message'));

        await waitFor(() => {
            expect(getByText('Copied!')).toBeTruthy();
        });
    });

    it('renders retry button only for user messages', () => {
        const onRetry = jest.fn();
        const userMsg = { id: '7', role: 'user', content: 'Test', createdAt: Date.now() };
        const assistantMsg = { id: '8', role: 'assistant', content: 'Reply', createdAt: Date.now() };

        const { getByTitle, rerender } = render(
            <MessageBubble msg={userMsg} user={mockUser} onRetry={onRetry} />
        );
        expect(getByTitle('Retry this message')).toBeTruthy();

        rerender(<MessageBubble msg={assistantMsg} user={mockUser} onRetry={onRetry} />);
        expect(() => getByTitle('Retry this message')).toThrow();
    });

    it('calls onRetry when retry button is clicked', () => {
        const onRetry = jest.fn();
        const msg = { id: '9', role: 'user', content: 'Retry me', createdAt: Date.now() };
        const { getByTitle } = render(
            <MessageBubble msg={msg} user={mockUser} onRetry={onRetry} isLoading={false} />
        );

        fireEvent.click(getByTitle('Retry this message'));
        expect(onRetry).toHaveBeenCalledWith('9');
    });

    it('renders Amazon cart buttons when amazonCarts is present', () => {
        const msg = {
            id: '10',
            role: 'assistant',
            content: 'Check these out',
            createdAt: Date.now(),
            amazonCarts: [{
                items: [
                    { name: 'Yoga Mat', url: 'https://amazon.com/yoga-mat' },
                    { name: 'Dumbbells', url: 'https://amazon.com/dumbbells' },
                ],
            }],
        };

        const { getByText } = render(<MessageBubble msg={msg} user={mockUser} />);
        expect(getByText('Yoga Mat')).toBeTruthy();
        expect(getByText('Dumbbells')).toBeTruthy();
    });

    it('does not render Amazon cart buttons when none present', () => {
        const msg = { id: '11', role: 'assistant', content: 'No carts', createdAt: Date.now() };
        const { queryByText } = render(<MessageBubble msg={msg} user={mockUser} />);
        expect(queryByText('Yoga Mat')).toBeNull();
    });

    it('handles user with no displayName gracefully', () => {
        const msg = { id: '12', role: 'user', content: 'Anonymous', createdAt: Date.now() };
        const { getByText } = render(<MessageBubble msg={msg} user={{}} />);
        expect(getByText('?')).toBeTruthy();
    });
});

describe('linkifyContent', () => {
    it('returns plain text unchanged', () => {
        const result = linkifyContent('Hello world');
        // When no URLs are found, regex exec never matches so parts stays empty,
        // the final slice adds the whole string, and parts.length > 0 returns the array
        expect(result).toEqual(['Hello world']);
    });

    it('returns null/undefined unchanged', () => {
        expect(linkifyContent(null)).toBeNull();
        expect(linkifyContent(undefined)).toBeUndefined();
    });

    it('detects and wraps https URLs', () => {
        const result = linkifyContent('Visit https://example.com for more');
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(3); // "Visit ", <a>, " for more"

        // Check the link element
        const link = result[1];
        expect(link.props.href).toBe('https://example.com');
        expect(link.props.target).toBe('_blank');
        expect(link.props.rel).toBe('noopener noreferrer');
    });

    it('detects and wraps http URLs', () => {
        const result = linkifyContent('Check http://test.org now');
        expect(Array.isArray(result)).toBe(true);
        const link = result[1];
        expect(link.props.href).toBe('http://test.org');
    });

    it('handles www. URLs by adding https://', () => {
        const result = linkifyContent('Go to www.google.com');
        expect(Array.isArray(result)).toBe(true);
        const link = result[1];
        expect(link.props.href).toBe('https://www.google.com');
    });

    it('handles multiple URLs in the same text', () => {
        const result = linkifyContent('Visit https://a.com and https://b.com today');
        expect(Array.isArray(result)).toBe(true);
        const links = result.filter((r) => r?.props?.href);
        expect(links.length).toBe(2);
    });

    it('strips trailing punctuation from URLs', () => {
        const result = linkifyContent('Check https://example.com.');
        expect(Array.isArray(result)).toBe(true);
        const link = result.find((r) => r?.props?.href);
        expect(link.props.href).toBe('https://example.com');
    });

    it('preserves URL at end of text', () => {
        const result = linkifyContent('Link: https://example.com/path');
        expect(Array.isArray(result)).toBe(true);
        const link = result.find((r) => r?.props?.href);
        expect(link.props.href).toBe('https://example.com/path');
    });

    it('detects bare domain URLs like youtube.com/path', () => {
        const result = linkifyContent('Try youtube.com/watch?v=dQw4w9WgXcQ for testing');
        expect(Array.isArray(result)).toBe(true);
        const link = result.find((r) => r?.props?.href);
        expect(link.props.href).toBe('https://youtube.com/watch?v=dQw4w9WgXcQ');
    });

    it('detects bare domain without path like google.com', () => {
        const result = linkifyContent('Visit google.com for search');
        expect(Array.isArray(result)).toBe(true);
        const link = result.find((r) => r?.props?.href);
        expect(link.props.href).toBe('https://google.com');
    });
});
