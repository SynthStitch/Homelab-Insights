import { useRef, useState } from "react";
import { motion, useScroll, useMotionValueEvent, AnimatePresence } from "motion/react";
import { IconMenu2, IconX } from "@tabler/icons-react";
import { cn } from "../../lib/cn.js";

/**
 * Adapted from Aceternity UI "Resizable Navbar"
 * https://ui.aceternity.com/components/resizable-navbar
 */

function NavButton({ children, onClick, variant = "primary", href }) {
  const Element = href ? "a" : "button";
  return (
    <Element
      href={href}
      onClick={onClick}
      className={cn(
        "res-nav-btn",
        variant === "secondary"
          ? "res-nav-btn--secondary"
          : "res-nav-btn--primary"
      )}
    >
      {children}
    </Element>
  );
}

export default function ResizableNavbar({ items = [], onLogout, isAuthed, peek = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const { scrollY } = useScroll(); // use window scroll

  useMotionValueEvent(scrollY, "change", (latest) => {
    setCompact(latest > 40);
  });

  const navAnimation = compact
    ? {
        width: "65%",
        y: -6,
        scale: 0.96,
        borderRadius: "16px",
        padding: "0.65rem 1.2rem",
        backdropFilter: "blur(12px)",
        boxShadow:
          "0 0 28px rgba(34,42,53,0.28), 0 14px 48px rgba(0,0,0,0.32)",
      }
    : {
        width: "90%",
        y: 0,
        scale: 1,
        borderRadius: "999px",
        padding: "0.9rem 1.5rem",
        backdropFilter: "blur(8px)",
        boxShadow: "0 10px 40px rgba(0,0,0,0.18)",
      };

  return (
    <div className={cn("res-nav-shell", peek && "res-nav-shell--peek")}>
      <motion.nav
        className="res-nav"
        animate={navAnimation}
        transition={{ type: "spring", stiffness: 180, damping: 28 }}
      >
        <div className="res-nav-body">
          <a className="res-nav-logo" href="/">
            Homelab Insights
          </a>
          <div className="res-nav-items">
            {items.map((item) => (
              <a key={item.name} href={item.link} className="res-nav-link">
                {item.name}
              </a>
            ))}
          </div>
          <div className="res-nav-actions">
            {isAuthed ? (
              <NavButton onClick={onLogout} variant="secondary">
                Sign Out
              </NavButton>
            ) : (
              <NavButton href="/sign-in" variant="primary">
                Sign In
              </NavButton>
            )}
          </div>
          <button
            type="button"
            className="res-nav-toggle"
            onClick={() => setIsOpen((prev) => !prev)}
            aria-label={isOpen ? "Close menu" : "Open menu"}
          >
            {isOpen ? <IconX size={18} /> : <IconMenu2 size={18} />}
          </button>
        </div>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="res-nav-mobile"
            >
              {items.map((item) => (
                <a
                  key={`mobile-${item.name}`}
                  href={item.link}
                  className="res-nav-link res-nav-link--mobile"
                  onClick={() => setIsOpen(false)}
                >
                  {item.name}
                </a>
              ))}
              <div className="res-nav-mobile-actions">
                {isAuthed ? (
                  <NavButton onClick={onLogout} variant="secondary">
                    Sign Out
                  </NavButton>
                ) : (
                  <NavButton href="/sign-in" variant="primary">
                    Sign In
                  </NavButton>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.nav>
    </div>
  );
}
