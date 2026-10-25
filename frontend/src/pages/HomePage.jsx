import Navbar from '../components/Navbar.jsx'
import HeroSection from '../components/HeroSection.jsx'
import ProblemSection from '../components/ProblemSection.jsx'
import HowItWorks from '../components/HowItWorks.jsx'
import FeaturesSection from '../components/FeaturesSection.jsx'
import FinalCTA from '../components/FinalCTA.jsx'
import Footer from '../components/Footer.jsx'

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main>
        <HeroSection />
        <ProblemSection />
        <HowItWorks />
        <FeaturesSection />
        <FinalCTA />
      </main>
      <Footer />
    </>
  )
}
