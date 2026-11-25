'use client';

import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

const sectionLinks = [
  { label: 'About', href: '#about' },
  { label: 'Services', href: '#services' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Stories', href: '#testimonials' },
];

export default function MarketingHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && menuOpen) {
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    }
  }

  function closeMenu() {
    setMenuOpen(false);
    menuButtonRef.current?.focus();
  }

  return (
    <header className="marketing-nav" id="home" onKeyDown={handleKeyDown}>
      <a className="marketing-brand" href="/" aria-label="QuickDoc home">
        <img src="/logo/quickdoc-logo.svg" alt="QuickDoc" />
      </a>
      <nav className="marketing-nav__links" aria-label="Main navigation">
        {sectionLinks.map((link) => <a href={link.href} key={link.href}>{link.label}</a>)}
        <a href="/login">Sign in</a>
        <a className="marketing-button marketing-button--small" href="/register">Create account</a>
      </nav>
      <button
        ref={menuButtonRef}
        className="mobile-menu__toggle"
        type="button"
        aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-controls="mobile-menu-panel"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path className="mobile-menu__line--top" d="M5 7h14" />
          <path className="mobile-menu__line--middle" d="M5 12h14" />
          <path className="mobile-menu__line--bottom" d="M5 17h14" />
        </svg>
        <span>{menuOpen ? 'Close' : 'Menu'}</span>
      </button>
      <div className="marketing-mobile-menu" id="mobile-menu-panel" hidden={!menuOpen}>
        <nav className="mobile-menu__links" aria-label="Mobile navigation">
          {sectionLinks.map((link) => (
            <a href={link.href} key={link.href} onClick={closeMenu}>{link.label}</a>
          ))}
          <a href="/login" onClick={closeMenu}>Sign in</a>
          <a className="marketing-button" href="/register" onClick={closeMenu}>Create account</a>
        </nav>
      </div>
    </header>
  );
}
