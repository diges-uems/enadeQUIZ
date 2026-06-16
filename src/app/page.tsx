'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ArrowRight, Shield, Zap, Users } from 'lucide-react'

// ─── CSS Keyframes ────────────────────────────────────────────────
const ANIMATION_STYLES = `
  @keyframes floatUp {
    0% { transform: translateY(0) translateX(0); opacity: 0; }
    10% { opacity: 0.08; }
    90% { opacity: 0.08; }
    100% { transform: translateY(-110vh) translateX(30px); opacity: 0; }
  }
  @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes fadeInDown { from { opacity: 0; transform: translateY(-30px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes scaleIn { from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: scale(1); } }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes glow { 0%, 100% { box-shadow: 0 0 20px rgba(200,168,75,0); } 50% { box-shadow: 0 0 30px rgba(200,168,75,0.1); } }
`

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
    <div className="min-h-screen flex flex-col text-[#E8EDFF]" style={{
      backgroundImage: `linear-gradient(180deg, rgba(0, 34, 85, 0.85) 0%, rgba(0, 34, 85, 0.98) 100%), url('https://www.uems.br/anexos/imagens/conteudo/uems_imagens_2023-09-22_13-02-19.png')`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }}>
      <style dangerouslySetInnerHTML={{ __html: ANIMATION_STYLES }} />

      {/* Subtle gradient overlay + animated particles */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-[#00338C]/10 rounded-full blur-[150px]" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-[#C8A84B]/5 rounded-full blur-[120px]" />

        {/* Animated floating particles */}
        <div className="absolute w-3 h-3 rounded-full bg-[#C8A84B] opacity-[0.08]" style={{ left: '10%', bottom: '-10px', animation: 'floatUp 18s linear infinite', animationDelay: '0s' }} />
        <div className="absolute w-4 h-4 rounded-full bg-[#00338C] opacity-[0.12]" style={{ left: '25%', bottom: '-16px', animation: 'floatUp 22s linear infinite', animationDelay: '3s' }} />
        <div className="absolute w-2 h-2 rounded-full bg-[#C8A84B] opacity-[0.1]" style={{ left: '45%', bottom: '-8px', animation: 'floatUp 16s linear infinite', animationDelay: '7s' }} />
        <div className="absolute w-4 h-4 rounded-full bg-[#00338C] opacity-[0.06]" style={{ left: '60%', bottom: '-16px', animation: 'floatUp 25s linear infinite', animationDelay: '2s' }} />
        <div className="absolute w-3 h-3 rounded-full bg-[#C8A84B] opacity-[0.05]" style={{ left: '75%', bottom: '-12px', animation: 'floatUp 20s linear infinite', animationDelay: '5s' }} />
        <div className="absolute w-2 h-2 rounded-full bg-[#00338C] opacity-[0.15]" style={{ left: '88%', bottom: '-8px', animation: 'floatUp 14s linear infinite', animationDelay: '9s' }} />
        <div className="absolute w-3 h-3 rounded-full bg-[#C8A84B] opacity-[0.07]" style={{ left: '35%', bottom: '-12px', animation: 'floatUp 19s linear infinite', animationDelay: '11s' }} />
        <div className="absolute w-2 h-2 rounded-full bg-[#00338C] opacity-[0.1]" style={{ left: '55%', bottom: '-8px', animation: 'floatUp 17s linear infinite', animationDelay: '6s' }} />
      </div>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 relative z-10">
        <div className="w-full max-w-lg flex flex-col items-center gap-8">
          {/* Logo & Branding */}
          <div className="flex flex-col items-center gap-4" style={{ animation: 'fadeInDown 0.7s ease-out' }}>
            {/* Logo */}
            <img
              src="/logo.png"
              alt="UEMS"
              className="w-20 h-20 object-contain drop-shadow-[0_0_24px_rgba(200,168,75,0.3)]"
              style={{ animation: 'scaleIn 0.6s ease-out 0.2s both' }}
            />

            {/* Title */}
            <h1
              className="text-4xl sm:text-5xl font-bold font-[family-name:var(--font-space-grotesk)] text-[#C8A84B] text-center tracking-tight"
              style={{ animation: 'fadeInUp 0.6s ease-out 0.4s both' }}
            >
              ENADE Quiz
            </h1>

            {/* Subtitle */}
            <p
              className="text-base sm:text-lg text-[#8892B0] text-center max-w-sm"
              style={{ animation: 'fadeIn 0.6s ease-out 0.6s both' }}
            >
              Sistema de Votação em Tempo Real — UEMS/DIGES
            </p>
          </div>

          {/* Session Code Input Card */}
          <div
            className="w-full bg-[#0D1B3E] border border-[#1A2A5E] rounded-2xl p-6 sm:p-8 shadow-xl shadow-[#00338C]/10"
            style={{ animation: 'fadeInUp 0.7s ease-out 0.7s both, glow 3s ease-in-out infinite' }}
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
                placeholder="Ex: ENADE25"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                onKeyDown={handleKeyDown}
                maxLength={8}
                className="h-14 text-center text-xl font-semibold tracking-[0.2em] uppercase bg-[#050A1A] border-[#1A2A5E] text-[#E8EDFF] placeholder:text-[#3A4A7E] placeholder:tracking-normal placeholder:font-normal placeholder:text-base focus-visible:border-[#C8A84B] focus-visible:ring-[#C8A84B]/30 focus-visible:ring-[3px] rounded-xl transition-all"
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

            {/* Keyboard shortcut hint */}
            <p className="text-[#3A4A7E] text-xs text-center mt-3">
              Pressione Enter para entrar
            </p>
          </div>

          {/* Feature badges */}
          <div className="flex flex-wrap justify-center gap-3 sm:gap-4" style={{ animation: 'fadeIn 0.6s ease-out 1.0s both' }}>
            <div className="flex items-center gap-2 text-xs sm:text-sm text-[#8892B0] bg-[#0D1B3E] px-3 py-1.5 rounded-full border border-[#1A2A5E]">
              <Zap className="w-4 h-4 text-[#C8A84B]" />
              Tempo Real
            </div>
            <div className="flex items-center gap-2 text-xs sm:text-sm text-[#8892B0] bg-[#0D1B3E] px-3 py-1.5 rounded-full border border-[#1A2A5E]">
              <Users className="w-4 h-4 text-[#C8A84B]" />
              Votação Coletiva
            </div>
            <div className="flex items-center gap-2 text-xs sm:text-sm text-[#8892B0] bg-[#0D1B3E] px-3 py-1.5 rounded-full border border-[#1A2A5E]">
              <Shield className="w-4 h-4 text-[#C8A84B]" />
              Seguro
            </div>
          </div>

          {/* How it works */}
          <div className="w-full" style={{ animation: 'fadeIn 0.6s ease-out 1.3s both' }}>
            <h2 className="text-center text-sm font-semibold text-[#5A6A9E] uppercase tracking-wider mb-5">
              Como funciona
            </h2>
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 justify-center items-stretch">
              {/* Step 1 */}
              <div
                className="flex-1 flex flex-col items-center gap-3 text-center bg-[#0D1B3E]/60 border border-[#1A2A5E] rounded-xl p-5"
                style={{ animation: 'fadeInUp 0.5s ease-out 1.5s both' }}
              >
                <div className="w-10 h-10 rounded-full bg-[#C8A84B]/20 border border-[#C8A84B]/40 flex items-center justify-center text-[#C8A84B] font-bold text-lg">1</div>
                <span className="text-2xl">🔑</span>
                <h3 className="text-white font-semibold text-sm">Digite o código</h3>
                <p className="text-[#5A6A9E] text-xs leading-relaxed">Insira o código fornecido pelo apresentador</p>
              </div>

              {/* Step 2 */}
              <div
                className="flex-1 flex flex-col items-center gap-3 text-center bg-[#0D1B3E]/60 border border-[#1A2A5E] rounded-xl p-5"
                style={{ animation: 'fadeInUp 0.5s ease-out 1.7s both' }}
              >
                <div className="w-10 h-10 rounded-full bg-[#C8A84B]/20 border border-[#C8A84B]/40 flex items-center justify-center text-[#C8A84B] font-bold text-lg">2</div>
                <span className="text-2xl">✋</span>
                <h3 className="text-white font-semibold text-sm">Vote</h3>
                <p className="text-[#5A6A9E] text-xs leading-relaxed">Selecione sua resposta em tempo real</p>
              </div>

              {/* Step 3 */}
              <div
                className="flex-1 flex flex-col items-center gap-3 text-center bg-[#0D1B3E]/60 border border-[#1A2A5E] rounded-xl p-5"
                style={{ animation: 'fadeInUp 0.5s ease-out 1.9s both' }}
              >
                <div className="w-10 h-10 rounded-full bg-[#C8A84B]/20 border border-[#C8A84B]/40 flex items-center justify-center text-[#C8A84B] font-bold text-lg">3</div>
                <span className="text-2xl">📊</span>
                <h3 className="text-white font-semibold text-sm">Veja o resultado</h3>
                <p className="text-[#5A6A9E] text-xs leading-relaxed">Acompanhe o gráfico ao vivo</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 relative z-10 border-t border-[#1A2A5E]/50" style={{ animation: 'fadeIn 0.5s ease-out 2.1s both', background: 'rgba(5,10,26,0.6)' }}>
        <div className="flex items-center justify-center gap-4">
          <div className="flex items-center gap-1.5">
            <img src="/logo.png" alt="UEMS" className="h-4 w-4 object-contain opacity-50" />
            <span className="text-xs text-[#3A4A7E]">UEMS / DIGES</span>
          </div>
          <span className="text-[#1A2A5E]">|</span>
          <a
            href="/admin"
            className="text-xs text-[#5A6A9E] hover:text-[#C8A84B] transition-colors duration-200"
          >
            Área Administrativa
          </a>
        </div>
      </footer>
    </div>
  )
}
