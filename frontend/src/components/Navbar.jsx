import { useState } from 'react'

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="site-header">
      <nav className="navbar container" aria-label="Main navigation">
        <a className="brand" href="/" aria-label="Mavro home">
          <span className="brand-mark" aria-hidden="true">m</span>
          <span>Mavro</span>
        </a>
        <button
          className="menu-toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span /><span />
        </button>
        <div className={`nav-links${menuOpen ? ' is-open' : ''}`}>
          <a href="#home" onClick={() => setMenuOpen(false)}>Home</a>
          <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
          <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
          <a className="button button-small" href="/tutor">Start Learning <span aria-hidden="true">↗</span></a>
        </div>
      </nav>
    </header>
  )
}
