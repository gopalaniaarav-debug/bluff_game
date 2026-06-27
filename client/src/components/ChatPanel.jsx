import { useEffect, useRef } from 'react';

export default function ChatPanel({ messages, onSend, onClose }) {
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = inputRef.current?.value?.trim();
    if (text) {
      onSend(text);
      inputRef.current.value = '';
    }
  };

  return (
    <div className="chat-panel">
      <div className="chat-panel__header">
        <h3>Table chat</h3>
        {onClose && (
          <button type="button" className="chat-panel__close" onClick={onClose} aria-label="Close chat">
            ×
          </button>
        )}
      </div>
      <div className="chat-panel__messages">
        {messages.length === 0 ? (
          <p className="chat-panel__empty">No messages yet — say hello!</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="chat-panel__msg">
              <span className="chat-panel__author">{m.playerName}</span>
              <span className="chat-panel__text">{m.message}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
      <form className="chat-panel__form" onSubmit={handleSubmit}>
        <input ref={inputRef} placeholder="Type a message…" maxLength={200} />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
