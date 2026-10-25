export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <a className="brand footer-brand" href="/" aria-label="Mavro home"><span className="brand-mark" aria-hidden="true">m</span><span>Mavro</span></a>
        <p>See the idea. Understand the why.</p>
        <span className="copyright">© {new Date().getFullYear()} MAVRO · MADE FOR CURIOUS MINDS</span>
      </div>
    </footer>
  )
}
