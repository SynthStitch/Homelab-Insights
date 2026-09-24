import { useState } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import { useTheme } from "../context/ThemeContext.jsx";

const linkClass = ({ isActive }) => `nav__link${isActive ? " is-active" : ""}`;
// eslint-disable-next-line no-undef
const BUILD = typeof __BUILD_TIME__ === "string" ? __BUILD_TIME__.slice(5, 16).replace("T", " ") : "dev";

function Mark() {
  return (
    <svg className="nav__mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="6" fill="var(--accent)" />
      <path
        d="M6 22 L12 13 L17 19 L22 9 L26 15"
        fill="none"
        stroke="var(--accent-ink)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Navbar({ items = [], isAuthed, username, onLogout }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { privacy, setPrivacy, labOpen, setLabOpen } = useTheme();
  // Close the mobile sheet on navigation.
  const [lastPath, setLastPath] = useState(location.pathname);
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname);
    setOpen(false);
  }

  const action = isAuthed ? (
    <button type="button" className="btn btn--sm" onClick={onLogout}>
      Sign out
    </button>
  ) : (
    <Link to="/sign-in" className="btn btn--sm btn--primary">
      Sign in
    </Link>
  );

  return (
    <header className="nav">
      <div className="nav__inner">
        <Link to="/" className="nav__brand">
          <Mark />
          Homelab Insights
        </Link>

        <nav className="nav__links" aria-label="Primary">
          {items.map((item) => (
            <NavLink key={item.link} to={item.link} className={linkClass} end={item.link === "/"}>
              {item.name}
            </NavLink>
          ))}
        </nav>

        <div className="nav__tools">
          <button
            type="button"
            className={`icon-btn${privacy ? " is-active" : ""}`}
            onClick={() => setPrivacy(!privacy)}
            aria-pressed={privacy}
            title={privacy ? "Privacy mode on: IDs and hosts are blurred" : "Privacy mode off"}
          >
            {privacy ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3l18 18M10.6 10.6a3 3 0 004.2 4.2M9.9 5.1A10.6 10.6 0 0112 5c5 0 9 4 10 7-.4 1.2-1.2 2.5-2.3 3.6M6.2 6.2C4 7.7 2.6 9.8 2 12c1 3 5 7 10 7 1.5 0 2.9-.3 4.2-.9" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12c1-3 5-7 10-7s9 4 10 7c-1 3-5 7-10 7S3 15 2 12z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
          <button type="button" className={`icon-btn${labOpen ? " is-active" : ""}`} onClick={() => setLabOpen(!labOpen)} aria-pressed={labOpen} title="Theme lab">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 3a9 9 0 010 18c-2 0-2.5-1.5-1.5-2.5S12 16 12 15c0-1.5-2-1.5-3-2.5S8 10 9.5 9.5 12 8 12 3z" />
            </svg>
          </button>
        </div>
        <div className="nav__actions">
          <span className="nav__user" title="Build time (UTC)">
            build {BUILD}
          </span>
          {isAuthed && username ? <span className="nav__user">{username}</span> : null}
          {action}
        </div>

        <button
          type="button"
          className="nav__toggle"
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          )}
        </button>
      </div>

      {open ? (
        <div className="nav__sheet">
          {items.map((item) => (
            <NavLink key={item.link} to={item.link} className={linkClass} end={item.link === "/"}>
              {item.name}
            </NavLink>
          ))}
          {action}
        </div>
      ) : null}
    </header>
  );
}
