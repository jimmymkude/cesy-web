'use client';

import { useState, useCallback } from 'react';
import { Copy, Check, RefreshCw, ShoppingCart } from 'lucide-react';

/**
 * Linkify text — find URLs and wrap them in clickable <a> tags.
 * Returns an array of strings and JSX <a> elements.
 */
function linkifyContent(text) {
    if (!text) return text;

    // Match URLs: http(s)://, www., or bare domains (e.g., youtube.com/watch?v=...)
    const urlRegex = /(https?:\/\/[^\s<]+|www\.[^\s<]+|[a-zA-Z0-9][-a-zA-Z0-9]*\.(com|org|net|io|dev|co|me|app|ai)(\/[^\s<]*)?)/gi;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = urlRegex.exec(text)) !== null) {
        // Add text before the URL
        if (match.index > lastIndex) {
            parts.push(text.slice(lastIndex, match.index));
        }

        const url = match[0];
        // Clean trailing punctuation that's likely not part of the URL
        const cleaned = url.replace(/[.,;:!?)]+$/, '');
        const trailing = url.slice(cleaned.length);

        const href = cleaned.startsWith('http') ? cleaned : `https://${cleaned}`;

        parts.push(
            <a
                key={`link-${match.index}`}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="message-link"
            >
                {cleaned}
            </a>
        );

        if (trailing) {
            parts.push(trailing);
        }

        lastIndex = match.index + url.length;
    }

    // Add remaining text after the last URL
    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : text;
}

/**
 * Format basic markdown: **bold**, *italic*, `code`
 * Works on string segments (skips JSX elements from linkify).
 */
function formatMarkdown(parts) {
    if (typeof parts === 'string') parts = [parts];
    if (!Array.isArray(parts)) return parts;

    const result = [];
    let keyCounter = 0;

    for (const part of parts) {
        if (typeof part !== 'string') {
            result.push(part); // JSX element (link), pass through
            continue;
        }

        // Split by markdown patterns: **bold**, *italic*, `code`
        const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(part)) !== null) {
            if (match.index > lastIndex) {
                result.push(part.slice(lastIndex, match.index));
            }

            if (match[2]) {
                // **bold**
                result.push(<strong key={`md-${keyCounter++}`}>{match[2]}</strong>);
            } else if (match[3]) {
                // *italic*
                result.push(<em key={`md-${keyCounter++}`}>{match[3]}</em>);
            } else if (match[4]) {
                // `code`
                result.push(<code key={`md-${keyCounter++}`} className="inline-code">{match[4]}</code>);
            }

            lastIndex = match.index + match[0].length;
        }

        if (lastIndex < part.length) {
            result.push(part.slice(lastIndex));
        }
    }

    return result.length > 0 ? result : parts;
}

/**
 * MessageBubble — renders a single chat message with:
 * - Clickable links (auto-detected URLs)
 * - Markdown formatting (**bold**, *italic*, `code`)
 * - Copy-to-clipboard button (hover-reveal)
 * - Retry button (user messages only)
 * - Amazon cart buttons (when present)
 */
export default function MessageBubble({ msg, user, onRetry, isLoading }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(msg.content);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = msg.content;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    }, [msg.content]);

    // Linkify first, then format markdown on assistant messages
    let content = linkifyContent(msg.content);
    if (msg.role === 'assistant') {
        content = formatMarkdown(content);
    }

    return (
        <div className={`message message-${msg.role}`}>
            <div className={`message-avatar message-avatar-${msg.role}`}>
                {msg.role === 'user' ? (
                    user?.displayName?.[0]?.toUpperCase() || '?'
                ) : (
                    'C'
                )}
            </div>
            <div className="message-bubble">
                <div className="message-content">{content}</div>

                {/* Copy button */}
                <button
                    className="copy-btn"
                    onClick={handleCopy}
                    title={copied ? 'Copied!' : 'Copy message'}
                    aria-label={copied ? 'Copied!' : 'Copy message'}
                >
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                </button>

                {/* Copied toast */}
                {copied && (
                    <span className="copy-toast">Copied!</span>
                )}

                {/* Retry button — user messages only */}
                {msg.role === 'user' && onRetry && (
                    <button
                        className="retry-btn"
                        onClick={() => onRetry(msg.id)}
                        disabled={isLoading}
                        title="Retry this message"
                    >
                        <RefreshCw size={13} />
                    </button>
                )}

                {/* Amazon cart buttons */}
                {msg.amazonCarts?.length > 0 && (
                    <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {msg.amazonCarts.map((cart, ci) => (
                            cart.items.map((item, ii) => (
                                <a
                                    key={`${ci}-${ii}`}
                                    href={item.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="amazon-cart-btn"
                                >
                                    <ShoppingCart size={16} />
                                    <span>{item.name}</span>
                                </a>
                            ))
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// Export for testing
export { linkifyContent, formatMarkdown };
