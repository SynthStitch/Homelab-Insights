import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "motion/react";
import { cn } from "../lib/cn.js";

const DEFAULT_CHARSET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-={}[];:,.<>/?";

const randomChar = (charset) => charset.charAt(Math.floor(Math.random() * charset.length));

const scrambledFrom = (original, charset) => {
  if (!original) return "";
  return original
    .split("")
    .map((ch) => (ch === " " ? " " : randomChar(charset)))
    .join("");
};

function EncryptedText({
  text,
  className = "",
  charset = DEFAULT_CHARSET,
  revealDelayMs = 50,
  flipDelayMs = 50,
  encryptedClassName = "encrypted-char",
  revealedClassName = "revealed-char",
}) {
  const containerRef = useRef(null);
  const isInView = useInView(containerRef, { once: true, margin: "-20%" });

  const [revealCount, setRevealCount] = useState(0);
  const scrambleRef = useRef([]);
  const animationRef = useRef(null);
  const startRef = useRef(0);
  const lastFlipRef = useRef(0);

  useEffect(() => {
    if (!text) return undefined;
    if (!isInView) return undefined;

    scrambleRef.current = scrambledFrom(text, charset).split("");
    startRef.current = performance.now();
    lastFlipRef.current = startRef.current;
    setRevealCount(0);

    const step = (now) => {
      const totalLength = text.length;
      const elapsed = now - startRef.current;
      const nextReveal = Math.min(
        totalLength,
        Math.floor(elapsed / Math.max(1, revealDelayMs))
      );
      setRevealCount(nextReveal);

      if (nextReveal >= totalLength) {
        return;
      }

      if (now - lastFlipRef.current >= Math.max(1, flipDelayMs)) {
        scrambleRef.current = scrambleRef.current.map((char, index) =>
          index < nextReveal || text[index] === " " ? text[index] : randomChar(charset)
        );
        lastFlipRef.current = now;
      }

      animationRef.current = requestAnimationFrame(step);
    };

    animationRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationRef.current);
  }, [text, charset, isInView, revealDelayMs, flipDelayMs]);

  if (!text) return null;

  const MotionSpan = motion.span;

  return (
    <MotionSpan ref={containerRef} className={cn(className)} aria-label={text} role="text">
      {text.split("").map((character, index) => {
        const isRevealed = index < revealCount;
        const display = isRevealed
          ? character
          : character === " "
          ? " "
          : scrambleRef.current[index] ?? randomChar(charset);
        return (
          <span
            key={`${character}-${index}`}
            className={cn(isRevealed ? revealedClassName : encryptedClassName)}
          >
            {display}
          </span>
        );
      })}
    </MotionSpan>
  );
}

export default EncryptedText;
