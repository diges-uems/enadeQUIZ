'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { GraduationCap, ArrowRight, Shield, Zap, Users } from 'lucide-react'

export default function Home() {
  const router = useRouter()
  const [codigo, setCodigo] = useState('')

  const handleEntrar = () => {
    const code = codigo.trim().toUpperCase()
    if (code.length > 0) {
      router.push(`/votar/${code}`)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleEntrar()
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#050A1A] text-[#E8EDFF]">
      {/* Subtle gradient overlay */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-[#00338C]/10 rounded-full blur-[150px]" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-[#C8A84B]/5 rounded-full blur-[120px]" />
      </div>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 relative z-10">
        <div className="w-full max-w-lg flex flex-col items-center gap-8">
          {/* Logo & Branding */}
          <motion.div
            className="flex flex-col items-center gap-4"
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          >
            {/* Logo circle */}
            <motion.div
              className="w-24 h-24 rounded-full bg-[#0D1B3E] border border-[#1A2A5E] flex items-center justify-center shadow-lg shadow-[#00338C]/20"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.6, ease: 'backOut', delay: 0.2 }}
            >
              <GraduationCap className="w-12 h-12 text-[#C8A84B]" />
            </motion.div>

            {/* Title */}
            <motion.h1
              className="text-4xl sm:text-5xl font-bold font-[family-name:var(--font-space-grotesk)] text-[#C8A84B] text-center tracking-tight"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              ENADE Quiz
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              className="text-base sm:text-lg text-[#8892B0] text-center max-w-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.6 }}
            >
              Sistema de Votação em Tempo Real — UEMS/DIGES
            </motion.p>
          </motion.div>

          {/* Session Code Input Card */}
          <motion.div
            className="w-full bg-[#0D1B3E] border border-[#1A2A5E] rounded-2xl p-6 sm:p-8 shadow-xl shadow-[#00338C]/10"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.7 }}
          >
            <div className="flex flex-col gap-4">
              <label
                htmlFor="session-code"
                className="text-sm font-medium text-[#8892B0] text-center"
              >
                Digite o código da sessão para participar
              </label>

              <Input
                id="session-code"
                type="text"
                placeholder="Ex: ENADE24"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={6}
                className="h-14 text-center text-xl font-semibold tracking-[0.3em] uppercase bg-[#050A1A] border-[#1A2A5E] text-[#E8EDFF] placeholder:text-[#3A4A7E] placeholder:tracking-normal placeholder:font-normal placeholder:text-base focus-visible:border-[#C8A84B] focus-visible:ring-[#C8A84B]/30 focus-visible:ring-[3px] rounded-xl transition-all"
              />

              <Button
                onClick={handleEntrar}
                disabled={codigo.trim().length === 0}
                className="h-13 text-lg font-semibold bg-[#00338C] hover:bg-[#0044B8] text-white rounded-xl transition-all duration-200 shadow-lg shadow-[#00338C]/30 hover:shadow-[#0044B8]/40 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Entrar
                <ArrowRight className="w-5 h-5 ml-1" />
              </Button>
            </div>
          </motion.div>

          {/* Feature badges */}
          <motion.div
            className="flex flex-wrap justify-center gap-4 sm:gap-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 1.0 }}
          >
            <div className="flex items-center gap-2 text-xs sm:text-sm text-[#5A6A9E]">
              <Zap className="w-4 h-4 text-[#C8A84B]" />
              Tempo Real
            </div>
            <div className="flex items-center gap-2 text-xs sm:text-sm text-[#5A6A9E]">
              <Users className="w-4 h-4 text-[#C8A84B]" />
              Votação Coletiva
            </div>
            <div className="flex items-center gap-2 text-xs sm:text-sm text-[#5A6A9E]">
              <Shield className="w-4 h-4 text-[#C8A84B]" />
              Seguro
            </div>
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <motion.footer
        className="py-4 text-center relative z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 1.2 }}
      >
        <a
          href="/admin"
          className="text-xs text-[#3A4A7E] hover:text-[#C8A84B] transition-colors duration-200"
        >
          Área Administrativa
        </a>
      </motion.footer>
    </div>
  )
}
