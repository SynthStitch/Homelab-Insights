import { useState } from "react";
import { NavLink, Link, useLocation } from "react-router-dom";

const linkClass = ({ isActive }) => `nav__link${isActive ? " is-active" : ""}`;

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

        <div className="nav__actions">
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
