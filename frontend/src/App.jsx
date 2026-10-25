import HomePage from './pages/HomePage.jsx'
import TutorDashboard from './TutorDashboard.jsx'
import './App.css'

function App() {
  const isTutorPage = window.location.pathname.replace(/\/$/, '') === '/tutor'

  return isTutorPage ? <TutorDashboard /> : <HomePage />
}

export default App
