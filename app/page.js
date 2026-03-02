'use client';

import { useRef, useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/contexts/ChatContext';
import AppShell from '@/components/AppShell';
import LoginPage from '@/components/LoginPage';
import VoiceCall from '@/components/VoiceCall';

function ChatArea() {
  const { user } = useAuth();
  const { messages, isLoading, error, sendMessage, clearChat } = useChat();
  const [input, setInput] = useState('');
  const [showVoiceCall, setShowVoiceCall] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;
    const text = input;
    setInput('');
    await sendMessage(text);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      <div className="chat-container">
        <div className="chat-messages">
          {messages.length === 0 && !isLoading && (
            <div className="empty-state">
              <div className="empty-state-icon">💬</div>
              <h2 className="empty-state-title">Hey there!</h2>
              <p className="empty-state-description">
                I&apos;m Cesy, your AI fitness assistant. Ask me about workouts, schedules, or anything fitness-related. I&apos;ll keep it short and witty.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`message message-${msg.role}`}>
              <div className={`message-avatar message-avatar-${msg.role}`}>
                {msg.role === 'user' ? (
                  user?.displayName?.[0]?.toUpperCase() || '?'
                ) : (
                  'C'
                )}
              </div>
              <div className="message-bubble">
                {msg.content}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="message message-assistant">
              <div className="message-avatar message-avatar-assistant">C</div>
              <div className="typing-indicator">
                <div className="typing-dots">
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div style={{
              padding: 'var(--space-3) var(--space-4)',
              background: 'var(--color-error-soft)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-error)',
              fontSize: 'var(--text-sm)',
              textAlign: 'center',
            }}>
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-area">
          <form onSubmit={handleSend} className="chat-input-wrapper">
            <textarea
              ref={inputRef}
              className="chat-input"
              placeholder="Ask Cesy anything..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={isLoading}
            />
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={() => setShowVoiceCall(true)}
              title="Voice call"
              style={{ fontSize: 'var(--text-lg)' }}
            >
              🎙️
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={clearChat}
              title="New conversation"
              style={{ fontSize: 'var(--text-lg)' }}
            >
              🗑️
            </button>
            <button
              type="submit"
              className="send-btn"
              disabled={!input.trim() || isLoading}
              title="Send message"
            >
              {isLoading ? (
                <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </button>
          </form>
        </div>
      </div>

      {showVoiceCall && (
        <VoiceCall onClose={() => setShowVoiceCall(false)} />
      )}
    </>
  );
}

export default function Home() {
  const { user, loading } = useAuth();

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
    return <LoginPage />;
  }

  return (
    <AppShell>
      <ChatArea />
    </AppShell>
  );
}
