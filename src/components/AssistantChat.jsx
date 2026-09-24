import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";

const API_BASE = import.meta.env.VITE_API_BASE?.replace(/\/$/, "") || "";
const CHAT_ENDPOINT = `${API_BASE}/api/assistant/chat`;

const initialGreeting = {
  role: "assistant",
  content: "Ask me about node health, VM metrics, or what changed recently.",
};

function formatBlocks(text) {
  if (!text) return [];
  const blocks = [];
  let list = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("- ")) {
      list.push(line.slice(2));
      continue;
    }
    if (list.length) {
      blocks.push({ type: "list", items: list });
      list = [];
    }
    blocks.push({ type: "p", text: line });
  }
  if (list.length) blocks.push({ type: "list", items: list });
  return blocks;
}

function MessageBubble({ role, content }) {
  const blocks = formatBlocks(content);
  return (
    <div className={`msg msg--${role}`}>
      <div className="msg__bubble">
        {blocks.length === 0
          ? content
          : blocks.map((block, idx) =>
              block.type === "list" ? (
                <ul key={idx}>
                  {block.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p key={idx}>{block.text}</p>
              ),
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

  const authHeader = useMemo(
    () => (auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    [auth],
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  if (!auth?.token) return null;

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
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ message: question }),
      });
      if (!response.ok) throw new Error("Assistant request failed");
      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply || "I couldn't find that information." },
      ]);
    } catch (err) {
      console.error(err);
      setError("Unable to reach the assistant. Try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="assistant">
      {isOpen ? (
        <div className="assistant__panel" role="dialog" aria-label="AI copilot">
          <div className="assistant__head">
            <div>
              <span className="panel__title">Ops copilot</span>
              <p className="assistant__sub">grounded in recent snapshots</p>
            </div>
            <button
              type="button"
              className="assistant__close"
              onClick={() => setIsOpen(false)}
              aria-label="Close copilot"
            >
              ×
            </button>
          </div>
          <div className="assistant__body" ref={scrollRef}>
            {messages.map((message, index) => (
              <MessageBubble key={index} role={message.role} content={message.content} />
            ))}
            {pending ? <p className="assistant__note">thinking…</p> : null}
            {error ? <p className="assistant__note assistant__note--error">{error}</p> : null}
          </div>
          <form className="assistant__form" onSubmit={handleSubmit}>
            <input
              placeholder="Ask about nodes, VMs, alerts…"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              disabled={pending}
            />
            <button type="submit" className="btn btn--primary btn--sm" disabled={pending || !inputValue.trim()}>
              Send
            </button>
          </form>
        </div>
      ) : null}

      <button
        type="button"
        className="btn btn--primary assistant__toggle"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
      >
        {isOpen ? "Close" : "Ask copilot"}
      </button>
    </div>
  );
}
