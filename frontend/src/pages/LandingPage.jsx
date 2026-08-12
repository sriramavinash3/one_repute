import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ArrowRight, Bot, CheckCircle2, ShieldCheck, Zap, Layout, MessageSquare, PieChart, BellRing, Menu, X } from 'lucide-react'
import Button from '../components/ui/button'
import PricingSection from '../components/pricing/PricingSection'
import Logo from '../components/common/Logo'
import Seo from '../components/seo/Seo'

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } }
}

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } }
}

const LANDING_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'One Repute',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: 'https://onerepute.com/',
  description:
    'Enterprise reputation management system that automates Google review responses with AI and escalates critical reviews to managers via WhatsApp.',
  publisher: {
    '@type': 'Organization',
    name: 'One Repute',
    url: 'https://onerepute.com',
    logo: 'https://onerepute.com/logo.png'
  }
}

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const navLinks = [
    { href: '#features', label: 'Features' },
    { href: '#workflow', label: 'Workflow' },
    { href: '#pricing', label: 'Pricing' },
    { href: '#security', label: 'Security' }
  ]

  return (
    <div className="min-h-screen bg-white selection:bg-brand-100 selection:text-brand-900">
      <Seo
        title="One Repute | AI-Powered Google Review Management"
        description="Automate Google review replies with human-like AI, get instant WhatsApp escalation alerts for negative reviews, and manage multi-outlet reputation from one secure dashboard."
        path="/"
        jsonLd={LANDING_JSONLD}
      />
      {/* Navigation */}
      <nav className="fixed top-0 z-50 w-full border-b border-slatey-100 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-3 sm:py-4">
          <Logo to="/" size="md" showText={false} />
          <div className="hidden items-center gap-8 text-sm font-medium text-slatey-500 md:flex">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className="hover:text-brand-600 transition-colors">{link.label}</a>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="hidden sm:block">
              <Button size="sm" className="shadow-brand">Login to Dashboard</Button>
            </Link>
            <Link to="/login" className="sm:hidden">
              <Button size="sm" className="shadow-brand px-3">Login</Button>
            </Link>
            <button
              type="button"
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slatey-200 text-slatey-600 transition-colors hover:text-brand-600 md:hidden"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="overflow-hidden border-t border-slatey-100 bg-white/95 backdrop-blur-xl md:hidden"
            >
              <div className="flex flex-col gap-1 px-4 py-4">
                {navLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="rounded-lg px-3 py-2.5 text-sm font-medium text-slatey-600 transition-colors hover:bg-brand-50 hover:text-brand-600"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      <main className="pt-24 sm:pt-32">
        {/* Hero Section */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6 pb-16 sm:pb-24 text-center">
          <motion.div initial="hidden" animate="visible" variants={stagger} className="mx-auto max-w-4xl">
            <motion.div variants={fadeIn} className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-200">
              <Zap className="h-3 w-3 fill-brand-500 text-brand-500" />
              <span>Enterprise Reputation Management System</span>
            </motion.div>
            <motion.h1 variants={fadeIn} className="mt-6 text-3xl font-extrabold tracking-tight text-slatey-900 sm:text-5xl md:text-7xl">
              Turn Every Google Review <span className="text-brand-600">Into Trust.</span>
            </motion.h1>
            <motion.p variants={fadeIn} className="mt-6 text-base sm:text-xl leading-relaxed text-slatey-500">
              One Repute provides an exclusive infrastructure for automated reputation management. Authorized outlets get human-like AI replies and instant manager escalations via WhatsApp.
            </motion.p>
            <motion.div variants={fadeIn} className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
              <Link to="/login" className="w-full sm:w-auto">
                <Button size="lg" className="h-12 sm:h-14 w-full sm:w-auto px-8 text-base sm:text-lg shadow-brand">
                  Access Portal
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link to="/login" className="w-full sm:w-auto">
                <Button variant="outline" size="lg" className="h-12 sm:h-14 w-full sm:w-auto px-8 text-base sm:text-lg bg-white">
                  Dashboard Preview
                </Button>
              </Link>
            </motion.div>
            <motion.div variants={fadeIn} className="mt-10 flex flex-col sm:flex-row justify-center items-center gap-4 sm:gap-8 text-sm font-medium text-slatey-400">
              <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Admin-Managed Access</span>
              <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Real-time Monitoring</span>
            </motion.div>
          </motion.div>

          {/* Hero Image / UI Preview */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.8 }}
            className="mt-20 relative"
          >
            <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent z-10 h-full" />
            <div className="mx-auto max-w-5xl rounded-3xl border border-slatey-200 bg-slatey-50 p-2 shadow-2xl overflow-hidden">
              <div className="rounded-[20px] overflow-hidden border border-slatey-100 bg-white">
                <img
                  src="https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=2426&ixlib=rb-4.0.3"
                  alt="Dashboard Preview"
                  className="w-full h-auto opacity-90 hover:scale-[1.01] transition-transform duration-700"
                />
              </div>
            </div>
          </motion.div>
        </section>

        {/* Feature Grid */}
        <section id="features" className="bg-slatey-50 py-16 sm:py-24">
          <div id="security" className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="text-center">
              <h2 className="text-2xl sm:text-3xl font-bold text-slatey-900">Enterprise-grade security & automation.</h2>
              <p className="mt-4 text-base sm:text-lg text-slatey-500">Authorized tools for multi-outlet management.</p>
            </div>

            <div className="mt-16 grid gap-8 md:grid-cols-3">
              {[
                {
                  icon: <Bot className="h-6 w-6" />,
                  title: 'AI Response Engine',
                  description: 'Context-aware replies that match your restaurant tone. Handles 5-star reviews instantly.'
                },
                {
                  icon: <BellRing className="h-6 w-6" />,
                  title: 'WhatsApp Escalations',
                  description: 'Critical 1-2 star reviews are sent directly to the manager for immediate intervention.'
                },
                {
                  icon: <PieChart className="h-6 w-6" />,
                  title: 'Advanced Analytics',
                  description: 'Track sentiment shifts, rating distributions, and response performance across all outlets.'
                },
                {
                  icon: <ShieldCheck className="h-6 w-6" />,
                  title: 'Encrypted Security',
                  description: 'Your Google Business Profile tokens are AES-encrypted and stored securely on our backend.'
                },
                {
                  icon: <Layout className="h-6 w-6" />,
                  title: 'Central Command',
                  description: 'A single admin dashboard to manage hundreds of outlets, users, and billing.'
                },
                {
                  icon: <MessageSquare className="h-6 w-6" />,
                  title: 'Template Tuning',
                  description: 'Fine-tune AI behavior, word counts, and emoji usage to keep responses brand-aligned.'
                }
              ].map((f, i) => (
                <motion.div
                  key={i}
                  whileHover={{ y: -5 }}
                  className="rounded-2xl border border-slatey-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    {f.icon}
                  </div>
                  <h3 className="text-lg font-bold text-slatey-900">{f.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-slatey-500">{f.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Workflow Section */}
        <section id="workflow" className="mx-auto max-w-7xl px-4 sm:px-6 py-16 sm:py-24">
          <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
            <div className="space-y-8">
              <h2 className="text-3xl sm:text-4xl font-bold text-slatey-900">How One Repute works for your business</h2>
              <div className="space-y-6">
                {[
                  { step: '01', title: 'Connect Google', text: 'Securely link your Google Business Profile via OAuth in one click.' },
                  { step: '02', title: 'Sync Outlets', text: 'Our system automatically discovers your locations and fetches existing reviews.' },
                  { step: '03', title: 'AI Automation', text: 'New reviews are processed by our AI engine to generate professional replies.' },
                  { step: '04', title: 'Team Dispatch', text: 'Negative feedback triggers a priority WhatsApp alert to the assigned manager.' },
                ].map((s) => (
                  <div key={s.step} className="flex gap-4">
                    <div className="text-xl font-black text-brand-200">{s.step}</div>
                    <div>
                      <h4 className="font-bold text-slatey-900">{s.title}</h4>
                      <p className="mt-1 text-sm text-slatey-500">{s.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl bg-slatey-900 p-6 sm:p-8 shadow-2xl text-white">
              <div className="flex items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-2 shrink-0">
                  <div className="h-3 w-3 rounded-full bg-rose-500" />
                  <div className="h-3 w-3 rounded-full bg-amber-500" />
                  <div className="h-3 w-3 rounded-full bg-emerald-500" />
                </div>
                <span className="text-[10px] sm:text-xs font-mono text-slatey-500 truncate">terminal@onerepute:~$ monitoring --live</span>
              </div>
              <div className="space-y-4 font-mono text-xs sm:text-sm overflow-x-auto">
                <p className="text-emerald-400 whitespace-nowrap">[09:12:04] New 5★ Review from Priya K. - "Excellent!"</p>
                <p className="text-slatey-400 whitespace-nowrap">[09:12:06] AI Generating Response... (Professional Tone)</p>
                <p className="text-emerald-400 whitespace-nowrap">[09:12:08] Response Posted to Google Profile.</p>
                <p className="text-rose-400 mt-6 whitespace-nowrap">[10:04:22] ALERT: 1★ Review from Rohan M. - "Slow service"</p>
                <p className="text-slatey-400 whitespace-nowrap">[10:04:23] Sentiment Analyzed: CRITICAL</p>
                <p className="text-amber-400 whitespace-nowrap">[10:04:25] Escalating to WhatsApp: Manager Sunil...</p>
                <p className="text-emerald-400 whitespace-nowrap">[10:04:28] WhatsApp Dispatch SUCCESS.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <PricingSection />

        {/* CTA Section */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6 py-16 sm:py-24">
          <div className="relative overflow-hidden rounded-[32px] sm:rounded-[40px] bg-brand-600 px-6 sm:px-8 py-16 sm:py-20 text-center text-white shadow-brand">
            <div className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10 blur-3xl h-96 w-96" />
            <div className="absolute right-0 bottom-0 translate-x-1/2 translate-y-1/2 rounded-full bg-brand-400/20 blur-3xl h-96 w-96" />

            <h2 className="relative z-10 text-3xl sm:text-4xl md:text-5xl font-extrabold">Streamline your brand reputation.</h2>
            <p className="relative z-10 mt-6 text-base sm:text-xl text-brand-100">Authorized outlets can access the dashboard to monitor automation and escalations.</p>
            <div className="relative z-10 mt-10 sm:mt-12 flex flex-col sm:flex-row justify-center items-stretch sm:items-center gap-4">
              <Link to="/login" className="w-full sm:w-auto">
                <Button size="lg" className="h-14 w-full sm:w-auto px-10 bg-white text-brand-600 hover:bg-brand-50 shadow-lg">
                  Authorized Login
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slatey-100 bg-white py-12">
        <div className="mx-auto max-w-7xl px-6 flex flex-col items-center justify-center gap-4 text-center text-sm text-slatey-500">
          <Logo size="sm" clickable={false} showText={false} />
          <p>© 2026 One Repute. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
