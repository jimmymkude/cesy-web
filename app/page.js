'use client';

import { useRef, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/contexts/ChatContext';
import AppShell from '@/components/AppShell';
import LoginPage from '@/components/LoginPage';
import VoiceCall from '@/components/VoiceCall';
import MessageBubble from '@/components/MessageBubble';
import { MessageSquare, Mic, Trash2, Send } from 'lucide-react';

function ChatArea() {
  const { user } = useAuth();
  const { messages, isLoading, error, sendMessage, retryMessage, clearChat } = useChat();
  const [input, setInput] = useState('');
  const [showVoiceCall, setShowVoiceCall] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const sentQueryRef = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Auto-send from ?q= or ?context= query param
  useEffect(() => {
    const q = searchParams.get('q');
    const ctx = searchParams.get('context');
    const prompt = q || ctx;
    if (prompt && !sentQueryRef.current && !isLoading) {
      sentQueryRef.current = true;
      sendMessage(prompt, { hidden: !!ctx });
      router.replace('/', { scroll: false });
    }
  }, [searchParams, isLoading, sendMessage, router]);

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
              <div className="empty-state-icon" style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-4)' }}>
                <MessageSquare size={48} strokeWidth={1.5} />
              </div>
              <h2 className="empty-state-title">Hey there!</h2>
              <p className="empty-state-description">
                I&apos;m Cesy, your AI assistant. Ask me about workouts, schedules, reminders, or just chat. I&apos;ll keep it short and witty.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              user={user}
              onRetry={retryMessage}
              isLoading={isLoading}
            />
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
            >
              <Mic size={20} strokeWidth={2} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={clearChat}
              title="New conversation"
            >
              <Trash2 size={20} strokeWidth={2} />
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
                <Send size={18} strokeWidth={2} />
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
