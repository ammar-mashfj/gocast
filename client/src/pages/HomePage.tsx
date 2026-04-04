import { useState, useCallback } from 'react'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import HeroSection from '../components/home/HeroSection'
import HowItWorks from '../components/home/HowItWorks'
import LiveNow from '../components/home/LiveNow'
import PricingSection from '../components/home/PricingSection'
import CtaSection from '../components/home/CtaSection'
import LoginModal from '../components/LoginModal'
import RegisterModal from '../components/RegisterModal'

type AuthModal = 'login' | 'register' | null

export default function HomePage() {
  const [authModal, setAuthModal] = useState<AuthModal>(null)

  const openLogin = useCallback(() => setAuthModal('login'), [])
  const openRegister = useCallback(() => setAuthModal('register'), [])
  const closeModal = useCallback(() => setAuthModal(null), [])

  return (
    <div className="bg-dark text-white font-sans min-h-screen">
      <div className="max-w-[1200px] mx-auto">
        <Navbar onOpenLogin={openLogin} onOpenRegister={openRegister} />
        <HeroSection onOpenRegister={openRegister} />
        <HowItWorks />
        <LiveNow />
        <PricingSection onOpenRegister={openRegister} />
        <CtaSection onOpenRegister={openRegister} />
        <Footer />
      </div>

      <LoginModal
        open={authModal === 'login'}
        onClose={closeModal}
        onSwitchToRegister={openRegister}
      />
      <RegisterModal
        open={authModal === 'register'}
        onClose={closeModal}
        onSwitchToLogin={openLogin}
      />
    </div>
  )
}
