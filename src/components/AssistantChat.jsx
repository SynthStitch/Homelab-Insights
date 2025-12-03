import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";

const API_BASE = import.meta.env.VITE_API_BASE?.replace(/\/$/, "") || "";
const CHAT_ENDPOINT = API_BASE ? `${API_BASE}/api/assistant/chat` : "/api/assistant/chat"; // server route

const initialGreeting = {
  role: "assistant",
  content: "Hi! I'm the Homelab Insights AI assistant. Ask me about node health, VM metrics, or upcoming alerts.",
};

function MessageBubble({ role, content }) {
  const formatBlocks = (text) => {
    if (!text) return [];
    const lines = text.split(/\r?\n/).map((l) => l.trim());
    const blocks = [];
    let list = [];
    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith("- ")) {
        list.push(line.slice(2));
      } else {
        if (list.length) {
          blocks.push({ type: "list", items: list });
          list = [];
        }
        blocks.push({ type: "p", text: line });
      }
    }
    if (list.length) {
      blocks.push({ type: "list", items: list });
    }
    return blocks;
  };

  const blocks = formatBlocks(content);

  return (
    <div className={`assistant-message assistant-message--${role}`}>
      <div className="assistant-message__body">
        {blocks.length === 0 ? (
          content
        ) : (
          blocks.map((block, idx) => {
            if (block.type === "list") {
              return (
                <ul key={`block-${idx}`} className="assistant-message__list">
                  {block.items.map((item, liIdx) => (
                    <li key={`li-${idx}-${liIdx}`}>{item}</li>
                  ))}
                </ul>
              );
            }
            return (
              <p key={`block-${idx}`} className="assistant-message__paragraph">
                {block.text}
              </p>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function AssistantChat() {
  const { auth } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([initialGreeting]);
  const [pending, setPending] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState("");
  const scrollRef = useRef(null);

  const authHeader = useMemo(() => {
    if (!auth?.token) return {};
    return { Authorization: `Bearer ${auth.token}` };
  }, [auth]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  if (!auth?.token) {
    return null;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!inputValue.trim() || pending) return;

    const question = inputValue.trim();
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInputValue("");
    setPending(true);
    setError("");

    try {
      const response = await fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
        },
        body: JSON.stringify({ message: question }),
      });

      if (!response.ok) {
        throw new Error("Assistant request failed");
      }
      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply || "I couldn't find that information." },
      ]);
    } catch (err) {
      console.error(err);
      setError("Unable to reach the AI assistant. Please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={`assistant-shell ${isOpen ? "assistant-shell--open" : ""}`}>
      {isOpen && (
        <div className="assistant-panel">
          <div className="assistant-panel__header">
            <div>
              <p className="assistant-panel__title">AI Ops Copilot</p>
              <p className="assistant-panel__subtitle">Powered by GPT-5 mini</p>
            </div>
            <button
              type="button"
              className="assistant-panel__close"
              onClick={() => setIsOpen(false)}
              aria-label="Close AI panel"
            >
              ×
            </button>
          </div>
          <div className="assistant-panel__body" ref={scrollRef}>
            {messages.map((message, index) => (
              <MessageBubble key={`msg-${index}-${message.role}`} role={message.role} content={message.content} />
            ))}
            {pending ? <p className="assistant-panel__typing">Assistant is thinking…</p> : null}
            {error ? <p className="assistant-panel__error">{error}</p> : null}
          </div>
          <form className="assistant-panel__form" onSubmit={handleSubmit}>
            <input
              className="assistant-input"
              placeholder="Ask about nodes, VMs, alerts…"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              disabled={pending}
            />
            <button type="submit" className="assistant-send" disabled={pending || !inputValue.trim()}>
              Send
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        className="assistant-toggle"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={isOpen ? "Hide AI assistant" : "Show AI assistant"}
      >
        {isOpen ? "Close" : "Ask AI"}
      </button>
    </div>
  );
}

