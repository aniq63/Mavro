export default function TutorAvatar({ compact = false }) {
  return (
    <div className={`tutor-avatar-wrap${compact ? ' is-compact' : ''}`}>
      <div className="mavro-avatar" role="img" aria-label="Illustrated Mavro tutor wearing a lavender hoodie">
        <img src="/Friendly%203D%20Coding%20Tutor%20Avatar.png" alt="" />
        <span className="avatar-sparkle" aria-hidden="true">✦</span>
      </div>
      {!compact && <div className="avatar-caption"><span className="avatar-ready-dot" /><span><b>Mavro</b><small>Your AI tutor · Ready</small></span></div>}
    </div>
  )
}
