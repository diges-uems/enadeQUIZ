'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { QRCode } from 'react-qrcode-logo'
import { Users } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────
interface Question {
  id: string
  sessionId: string
  text: string
  year: number
  course: string
  altA: string
  altB: string
  altC: string
  altD: string
  altE: string
  correctAnswer: string
  imageUrl: string | null
  isRevealed: boolean
  orderIndex: number
  createdAt: string
  updatedAt: string
}

interface SessionData {
  id: string
  code: string
  title: string
  status: string
  currentQuestionId: string | null
  createdAt: string
  updatedAt: string
  questions: Question[]
}

interface VoteResults {
  A: number
  B: number
  C: number
  D: number
  E: number
  total: number
}

interface RankingEntry {
  name: string
  rgm: string
  score: number
  answers: number
  corrects: number
}

// ─── Constants ────────────────────────────────────────────────────
const COLORS: Record<string, string> = {
  A: '#00338C',
  B: '#C8A84B',
  C: '#2196F3',
  D: '#4CAF50',
  E: '#F44336',
}

const ALT_LABELS = ['A', 'B', 'C', 'D', 'E'] as const

// ─── CSS Keyframes ────────────────────────────────────────────────
const ANIMATION_STYLES = `
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes fadeInDown { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes scaleIn { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
  @keyframes slideInLeft { from { opacity: 0; transform: translateX(-30px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes slideInRight { from { opacity: 0; transform: translateX(40px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes glow { 0%, 100% { box-shadow: 0 0 20px rgba(200,168,75,0); } 50% { box-shadow: 0 0 40px rgba(200,168,75,0.15); } }
  @keyframes textGlow { 0%, 100% { text-shadow: 0 0 10px rgba(200,168,75,0); } 50% { text-shadow: 0 0 20px rgba(200,168,75,0.4); } }
  @keyframes bounceScale { 0% { transform: scale(1.3); } 50% { transform: scale(0.95); } 100% { transform: scale(1); } }
  @keyframes dotPulse { 0%, 100% { transform: scale(1); opacity: 0.3; } 50% { transform: scale(1.5); opacity: 1; } }
  @keyframes borderPulse { 0%, 100% { opacity: 0.3; transform: scale(1); } 50% { opacity: 0.8; transform: scale(1.01); } }
  @keyframes glowPulse { 0%, 100% { box-shadow: 0 0 0px rgba(200,168,75,0); } 50% { box-shadow: 0 0 15px rgba(200,168,75,0.6); } }
  @keyframes rotateScaleIn { from { opacity: 0; transform: scale(0) rotate(-180deg); } to { opacity: 1; transform: scale(1) rotate(0deg); } }
  @keyframes fadeInOut { 0% { opacity: 0.5; } 50% { opacity: 1; } 100% { opacity: 0.5; } }
  @keyframes pulseScale { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  @keyframes growUp { from { transform: scaleY(0); } to { transform: scaleY(1); } }
  @keyframes slideDown { from { opacity: 0; transform: translateY(-40px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes correctGlow { 0%, 100% { box-shadow: 0 0 8px rgba(200,168,75,0.3); } 50% { box-shadow: 0 0 24px rgba(200,168,75,0.7); } }
  @keyframes qrOverlayIn { from { opacity: 0; backdrop-filter: blur(0px); } to { opacity: 1; backdrop-filter: blur(8px); } }
  @keyframes qrCardIn { from { opacity: 0; transform: scale(0.7); } to { opacity: 1; transform: scale(1); } }
`

// ─── Animated Counter Component ──────────────────────────────────
function AnimatedCounter({ value, className, style }: { value: number; className?: string; style?: React.CSSProperties }) {
  const [displayValue, setDisplayValue] = useState(value)
  const rafRef = useRef<number | null>(null)
  const prevValueRef = useRef(value)

  useEffect(() => {
    if (prevValueRef.current !== value) {
      const duration = 600
      const startTime = Date.now()
      const startValue = prevValueRef.current

      const animate = () => {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / duration, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        setDisplayValue(Math.round(startValue + (value - startValue) * eased))

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(animate)
        } else {
          setDisplayValue(value)
        }
      }
      rafRef.current = requestAnimationFrame(animate)
      prevValueRef.current = value
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [value])

  return (
    <span className={className} style={style}>
      {displayValue}
    </span>
  )
}

// ─── Component ────────────────────────────────────────────────────
export default function ApresentacaoPage({
  params,
}: {
  params: Promise<{ codigo: string }>
}) {
  const { codigo } = React.use(params)

  // ── State ──
  const [session, setSession] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [socket, setSocket] = useState<Socket | null>(null)
  const [participantCount, setParticipantCount] = useState(0)
  const [totalParticipants, setTotalParticipants] = useState(0)
  const [voteResults, setVoteResults] = useState<VoteResults>({
    A: 0, B: 0, C: 0, D: 0, E: 0, total: 0,
  })
  const [revealed, setRevealed] = useState(false)
  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(null)
  const [ranking, setRanking] = useState<RankingEntry[]>([])
  const [sessionFinished, setSessionFinished] = useState(false)
  const [showQrOverlay, setShowQrOverlay] = useState(false)
  const prevTotalVotes = useRef(0)

  // ── Derived ──
  const currentQuestion = session?.questions.find(
    (q) => q.id === currentQuestionId
  ) ?? null
  const currentIndex = session?.questions.findIndex(
    (q) => q.id === currentQuestionId
  ) ?? -1
  const totalQuestions = session?.questions.length ?? 0

  // ── Fetch session data ──
  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/session/${codigo}`)
      if (!res.ok) {
        setNotFound(true)
        return
      }
      const data: SessionData = await res.json()
      setSession(data)
      setCurrentQuestionId(data.currentQuestionId)
      if (data.status === 'finished') {
        setSessionFinished(true)
      }
      if (data.currentQuestionId) {
        const q = data.questions.find((q) => q.id === data.currentQuestionId)
        if (q) setRevealed(q.isRevealed)
      }
    } catch {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [codigo])

  // ── Socket connection ──
  useEffect(() => {
    fetchSession()
  }, [fetchSession])

  useEffect(() => {
    if (!session) return

    const socketInstance = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 10000,
    })

    socketInstance.on('connect', () => {
      socketInstance.emit('join-session', {
        sessionCode: codigo,
        role: 'presenter',
      })
    })

    socketInstance.on('vote-results', (data: VoteResults) => {
      setVoteResults(data)
    })

    socketInstance.on('participant-count', (data: { live: number; total: number }) => {
      setParticipantCount(data.live)
      setTotalParticipants(data.total)
    })

    socketInstance.on('session-state', (data: {
      participantCount: number
      totalParticipants: number
      currentQuestionId: string | null
      votingPaused: boolean
    }) => {
      setParticipantCount(data.participantCount)
      setTotalParticipants(data.totalParticipants)
      if (data.currentQuestionId !== currentQuestionId) {
        setCurrentQuestionId(data.currentQuestionId)
        if (data.currentQuestionId && session) {
          const q = session.questions.find((q) => q.id === data.currentQuestionId)
          if (q) setRevealed(q.isRevealed)
        } else {
          setRevealed(false)
        }
      }
    })

    socketInstance.on('question-activated', (data: { questionId: string }) => {
      setCurrentQuestionId(data.questionId)
      setRevealed(false)
      setVoteResults({ A: 0, B: 0, C: 0, D: 0, E: 0, total: 0 })
      prevTotalVotes.current = 0
    })

    socketInstance.on('answer-revealed', () => {
      setRevealed(true)
    })

    socketInstance.on('ranking-data', (data: RankingEntry[]) => {
      setRanking(data)
    })

    socketInstance.on('session-finished', () => {
      socketInstance.emit('get-ranking', { sessionCode: codigo })
      setSessionFinished(true)
    })

    socketInstance.on('session-reset', () => {
      setSessionFinished(false)
      setCurrentQuestionId(null)
      setRevealed(false)
      setVoteResults({ A: 0, B: 0, C: 0, D: 0, E: 0, total: 0 })
      setRanking([])
      setShowQrOverlay(false)
      prevTotalVotes.current = 0
      // Re-fetch session data to reflect reset
      fetchSession()
    })

    socketInstance.on('show-qr', (data: { visible: boolean }) => {
      setShowQrOverlay(data.visible)
    })

    setSocket(socketInstance)

    return () => {
      socketInstance.disconnect()
    }
  }, [session, codigo, fetchSession])

  const totalVotes = voteResults.total || ALT_LABELS.reduce((sum, alt) => sum + (voteResults[alt] ?? 0), 0)

  // ─── Loading state ───
  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center overflow-hidden" style={{ background: '#050A1A' }}>
        <style dangerouslySetInnerHTML={{ __html: ANIMATION_STYLES }} />
        <div className="flex flex-col items-center gap-4" style={{ animation: 'fadeIn 0.5s ease-out' }}>
          <div
            className="w-14 h-14 border-4 border-[#C8A84B] border-t-transparent rounded-full"
            style={{ animation: 'spin 1s linear infinite' }}
          />
          <p
            className="text-[#E8EDFF] text-xl"
            style={{ fontFamily: 'var(--font-space-grotesk)', animation: 'fadeInOut 2s ease-in-out infinite' }}
          >
            Carregando sessão...
          </p>
        </div>
      </div>
    )
  }

  // ─── Not found state ───
  if (notFound || !session) {
    return (
      <div className="h-screen w-screen flex items-center justify-center overflow-hidden" style={{ background: '#050A1A' }}>
        <style dangerouslySetInnerHTML={{ __html: ANIMATION_STYLES }} />
        <div className="text-center space-y-4" style={{ animation: 'scaleIn 0.5s ease-out' }}>
          <h1
            className="text-4xl font-bold text-[#E8EDFF]"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            Sessão não encontrada
          </h1>
          <p className="text-[#8899CC] text-lg">
            O código &quot;{codigo}&quot; não corresponde a nenhuma sessão ativa.
          </p>
        </div>
      </div>
    )
  }

  // ─── Session Finished State ───
  if (sessionFinished) {
    return (
      <div className="h-screen w-screen flex items-center justify-center overflow-hidden" style={{ background: '#050A1A' }}>
        <style dangerouslySetInnerHTML={{ __html: ANIMATION_STYLES }} />
        <div className="max-w-2xl w-full mx-4 text-center" style={{ animation: 'fadeInUp 0.8s ease-out' }}>
          {/* Trophy */}
          <div className="mb-4" style={{ animation: 'rotateScaleIn 0.8s ease-out' }}>
            <span className="text-7xl">🏆</span>
          </div>

          <h1
            className="text-6xl font-bold mb-3"
            style={{ fontFamily: 'var(--font-space-grotesk)', color: '#C8A84B', animation: 'fadeInUp 0.6s ease-out 0.3s both' }}
          >
            Sessão Encerrada
          </h1>
          <p
            className="text-[#8899CC] text-2xl mb-10"
            style={{ animation: 'fadeIn 0.5s ease-out 0.5s both' }}
          >
            Obrigado por participar!
          </p>

          {ranking.length === 0 ? (
            <div
              className="bg-[#0D1B3E] border border-[#1A2A5E] rounded-2xl p-8"
              style={{ animation: 'fadeInUp 0.5s ease-out 0.6s both' }}
            >
              <p className="text-[#8899CC] text-xl">Nenhum voto registrado ainda</p>
            </div>
          ) : (
            <div className="w-full max-w-3xl">
              {/* Podium Layout */}
              <div className="flex items-end justify-center gap-4 mb-8" style={{ animation: 'fadeInUp 0.6s ease-out 0.5s both' }}>
                {/* 2nd Place - Left */}
                {ranking.length >= 2 && (
                  <div className="flex flex-col items-center" style={{ animation: 'fadeInUp 0.5s ease-out 0.7s both' }}>
                    <div className="bg-[#0D1B3E] border border-[#C0C0C0]/40 rounded-xl p-4 w-48 text-center mb-2">
                      <span className="text-4xl font-bold text-[#C0C0C0]" style={{ fontFamily: 'var(--font-space-grotesk)' }}>2o</span>
                      <p className="text-[#E8EDFF] font-bold text-lg truncate mt-1" style={{ fontFamily: 'var(--font-space-grotesk)' }}>{ranking[1].name}</p>
                      <p className="text-[#8899CC] text-sm">RGM: {ranking[1].rgm}</p>
                    </div>
                    <div className="bg-[#C0C0C0]/20 w-full rounded-t-lg" style={{ height: '80px', animation: 'growUp 0.8s ease-out 1s both' }} />
                    <p className="text-[#C0C0C0] font-bold text-2xl mt-2" style={{ fontFamily: 'var(--font-space-grotesk)' }}>{ranking[1].corrects}/{totalQuestions}</p>
                  </div>
                )}
                {/* 1st Place - Center (Taller) */}
                <div className="flex flex-col items-center" style={{ animation: 'fadeInUp 0.5s ease-out 0.5s both' }}>
                  <div className="bg-[#0D1B3E] border-2 border-[#FFD700] rounded-xl p-5 w-56 text-center mb-2" style={{ animation: 'correctGlow 2s ease-in-out infinite' }}>
                    <span className="text-5xl font-bold text-[#FFD700]" style={{ fontFamily: 'var(--font-space-grotesk)' }}>1o</span>
                    <p className="text-[#E8EDFF] font-bold text-xl truncate mt-1" style={{ fontFamily: 'var(--font-space-grotesk)' }}>{ranking[0].name}</p>
                    <p className="text-[#8899CC] text-sm">RGM: {ranking[0].rgm}</p>
                  </div>
                  <div className="bg-[#FFD700]/20 w-full rounded-t-lg" style={{ height: '120px', animation: 'growUp 0.8s ease-out 0.8s both' }} />
                  <p className="text-[#FFD700] font-bold text-3xl mt-2" style={{ fontFamily: 'var(--font-space-grotesk)' }}>{ranking[0].corrects}/{totalQuestions}</p>
                </div>
                {/* 3rd Place - Right */}
                {ranking.length >= 3 && (
                  <div className="flex flex-col items-center" style={{ animation: 'fadeInUp 0.5s ease-out 0.9s both' }}>
                    <div className="bg-[#0D1B3E] border border-[#CD7F32]/40 rounded-xl p-4 w-48 text-center mb-2">
                      <span className="text-4xl font-bold text-[#CD7F32]" style={{ fontFamily: 'var(--font-space-grotesk)' }}>3o</span>
                      <p className="text-[#E8EDFF] font-bold text-lg truncate mt-1" style={{ fontFamily: 'var(--font-space-grotesk)' }}>{ranking[2].name}</p>
                      <p className="text-[#8899CC] text-sm">RGM: {ranking[2].rgm}</p>
                    </div>
                    <div className="bg-[#CD7F32]/20 w-full rounded-t-lg" style={{ height: '60px', animation: 'growUp 0.8s ease-out 1.2s both' }} />
                    <p className="text-[#CD7F32] font-bold text-2xl mt-2" style={{ fontFamily: 'var(--font-space-grotesk)' }}>{ranking[2].corrects}/{totalQuestions}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── No questions state ───
  if (session.questions.length === 0) {
    return (
      <div className="h-screen w-screen flex items-center justify-center overflow-hidden" style={{ background: '#050A1A' }}>
        <style dangerouslySetInnerHTML={{ __html: ANIMATION_STYLES }} />
        <div className="text-center space-y-4" style={{ animation: 'fadeInUp 0.5s ease-out' }}>
          <h2
            className="text-3xl font-bold text-[#E8EDFF]"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            Nenhuma questão cadastrada
          </h2>
          <p className="text-[#8899CC] text-lg">
            Adicione questões à sessão antes de iniciar a apresentação.
          </p>
        </div>
      </div>
    )
  }

  // ─── Bar Chart Component ───
  const renderBarChart = () => {
    const maxVotes = Math.max(...ALT_LABELS.map((alt) => voteResults[alt] ?? 0), 1)

    return (
      <div className="flex items-end gap-4 h-full w-full px-4">
        {ALT_LABELS.map((alt, idx) => {
          const votes = voteResults[alt] ?? 0
          const pct = totalVotes > 0 ? ((votes / totalVotes) * 100).toFixed(0) : '0'
          const barHeight = maxVotes > 0 ? (votes / maxVotes) * 100 : 0
          const isCorrect = revealed && currentQuestion?.correctAnswer === alt
          const isWrong = revealed && !isCorrect

          return (
            <div
              key={alt}
              className="flex-1 flex flex-col items-center gap-2 h-full justify-end"
              style={{ animation: `fadeInUp 0.4s ease-out ${idx * 0.08}s both` }}
            >
              {/* Vote count */}
              <div
                className="text-center"
                key={`${alt}-${votes}`}
                style={{ animation: 'bounceScale 0.3s ease-out' }}
              >
                <span
                  className={`block text-2xl font-bold ${isCorrect ? 'text-[#C8A84B]' : isWrong ? 'text-[#E8EDFF]/40' : 'text-[#E8EDFF]'}`}
                  style={{ fontFamily: 'var(--font-space-grotesk)' }}
                >
                  {votes > 0 ? `${pct}%` : ''}
                </span>
                <span className={`block text-sm ${isWrong ? 'text-[#8899CC]/40' : 'text-[#8899CC]'}`}>
                  {votes} {votes === 1 ? 'voto' : 'votos'}
                </span>
              </div>

              {/* Bar */}
              <div
                className="w-full rounded-t-lg relative overflow-hidden"
                style={{
                  height: `${Math.max(barHeight, 4)}%`,
                  minHeight: votes > 0 ? '8px' : '4px',
                  backgroundColor: isWrong ? `${COLORS[alt]}33` : COLORS[alt],
                  transformOrigin: 'bottom',
                  animation: `growUp 0.6s ease-out ${idx * 0.1 + 0.2}s both`,
                  transition: 'height 0.6s ease-out, background-color 0.4s ease-out, opacity 0.4s ease-out',
                  opacity: isWrong ? 0.35 : 1,
                  ...(isCorrect ? { animation: `growUp 0.6s ease-out ${idx * 0.1 + 0.2}s both, correctGlow 1.5s ease-in-out infinite` } : {}),
                }}
              >
                {/* Shine effect for correct answer */}
                {isCorrect && (
                  <div
                    className="absolute inset-0 rounded-t-lg border-2 border-[#C8A84B]"
                    style={{ animation: 'correctGlow 1.5s ease-in-out infinite' }}
                  />
                )}
              </div>

              {/* Letter badge */}
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold text-white shrink-0 mt-2 ${
                  isCorrect ? 'ring-2 ring-[#C8A84B] ring-offset-2 ring-offset-[#050A1A]' : ''
                }`}
                style={{
                  backgroundColor: isWrong ? `${COLORS[alt]}55` : COLORS[alt],
                  opacity: isWrong ? 0.4 : 1,
                  transition: 'all 0.4s ease-out',
                  ...(isCorrect ? { animation: 'bounceScale 0.5s ease-out 0.3s both' } : {}),
                }}
              >
                {alt}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ─── Main presenter display ───
  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ background: '#050A1A' }}>
      <style dangerouslySetInnerHTML={{ __html: ANIMATION_STYLES }} />

      {/* ── QR Code Overlay Modal ── */}
      {showQrOverlay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(5,10,26,0.92)', animation: 'qrOverlayIn 0.3s ease-out' }}
        >
          <div
            className="bg-[#0D1B3E] border border-[#1A2A5E] rounded-3xl p-10 flex flex-col items-center gap-6 relative"
            style={{ animation: 'qrCardIn 0.4s ease-out' }}
          >
            {/* Pulsing border glow */}
            <div
              className="absolute inset-0 rounded-3xl border-2 border-[#C8A84B]/30 pointer-events-none"
              style={{ animation: 'borderPulse 2.5s ease-in-out infinite' }}
            />
            <div className="flex flex-col items-center gap-4">
              <div className="bg-[#0D1B3E] rounded-xl px-5 py-2.5 border border-[#1A2A5E]">
                <img src="/logo.svg" alt="UEMS" className="h-16 max-w-[300px] object-contain" />
              </div>
              <QRCode
                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/votar/${codigo}`}
                size={360}
                bgColor="#0D1B3E"
                fgColor="#E8EDFF"
                qrStyle="dots"
                eyeRadius={8}
              />
            </div>
            <div className="text-center space-y-2">
              <p className="text-[#8899CC] text-xl">acesse:</p>
              <p
                className="text-[#E8EDFF] text-3xl font-bold"
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                enade.uems.br
              </p>
              <p className="text-[#8899CC] text-xl">código:</p>
              <p
                className="text-[#C8A84B] text-5xl font-bold tracking-widest"
                style={{ fontFamily: 'var(--font-space-grotesk)', animation: 'textGlow 2s ease-in-out infinite' }}
              >
                {codigo}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Thin Header Bar ── */}
      <header className="flex items-center justify-between px-6 py-1.5 border-b border-[#1A2A5E] shrink-0" style={{ background: '#0A1128' }}>
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="UEMS" className="h-7 w-7 object-contain" />
          <span
            className="text-[#E8EDFF] text-lg font-semibold"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            ENADE Quiz
          </span>
          <span className="text-[#3A4A7E]">—</span>
          <span className="text-[#8899CC] text-base">{session.title}</span>
        </div>
        <div className="flex items-center gap-4">
          <div
            className="flex items-center gap-1.5"
            key={participantCount}
            style={{ animation: 'bounceScale 0.3s ease-out' }}
          >
            <Users className="w-4 h-4 text-[#C8A84B]" />
            <AnimatedCounter
              value={participantCount}
              className="text-[#E8EDFF] text-base font-medium"
              style={{ fontFamily: 'var(--font-space-grotesk)' }}
            />
          </div>
          <span
            className="px-3 py-0.5 bg-[#0D1B3E] border border-[#1A2A5E] rounded text-[#C8A84B] font-bold text-sm tracking-wider"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            {codigo}
          </span>
          {currentQuestion && (
            <span
              className="px-3 py-0.5 bg-[#00338C] text-white font-bold text-sm rounded"
              style={{ fontFamily: 'var(--font-space-grotesk)', animation: 'bounceScale 0.3s ease-out' }}
              key={currentQuestionId}
            >
              Q{currentIndex + 1}/{totalQuestions}
            </span>
          )}
        </div>
      </header>

      {/* ── Main Content Area ── */}
      <div className="flex-1 flex min-h-0">
        {!currentQuestion ? (
          /* ── Waiting State: QR Code Center ── */
          <div
            className="flex-1 flex items-center justify-center gap-16 px-12 relative"
            style={{
              animation: 'fadeIn 0.5s ease-out',
              backgroundImage: `linear-gradient(135deg, rgba(5,10,26,0.82) 0%, rgba(13,27,62,0.72) 50%, rgba(5,10,26,0.85) 100%), url('https://www.uems.br/anexos/imagens/conteudo/uems_imagens_2023-09-22_13-02-19.png')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            {/* Background decorative elements */}
            <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[#00338C]/8 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-[#C8A84B]/5 rounded-full blur-[100px] pointer-events-none" />

            {/* QR Code Section */}
            <div className="flex flex-col items-center gap-6">
              <div
                className="bg-[#0D1B3E] border border-[#1A2A5E] rounded-2xl p-6 flex flex-col items-center gap-4 relative"
                style={{ animation: 'glow 3s ease-in-out infinite' }}
              >
                {/* Pulsing border glow */}
                <div
                  className="absolute inset-0 rounded-2xl border-2 border-[#C8A84B]/30 pointer-events-none"
                  style={{ animation: 'borderPulse 2.5s ease-in-out infinite' }}
                />
                <div className="flex flex-col items-center gap-3">
                  <div className="bg-[#0D1B3E] rounded-lg px-4 py-2 border border-[#1A2A5E]">
                    <img src="/logo.svg" alt="UEMS" className="h-12 max-w-[200px] object-contain" />
                  </div>
                  <QRCode
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/votar/${codigo}`}
                    size={240}
                    bgColor="#0D1B3E"
                    fgColor="#E8EDFF"
                    qrStyle="dots"
                    eyeRadius={8}
                  />
                </div>
                <div className="w-full border-t border-[#1A2A5E] pt-4 space-y-2 text-center">
                  <p className="text-[#8899CC] text-base">acesse:</p>
                  <p
                    className="text-[#E8EDFF] text-2xl font-bold"
                    style={{ fontFamily: 'var(--font-space-grotesk)' }}
                  >
                    enade.uems.br
                  </p>
                  <p className="text-[#8899CC] text-base">código:</p>
                  <p
                    className="text-[#C8A84B] text-4xl font-bold tracking-widest"
                    style={{ fontFamily: 'var(--font-space-grotesk)', animation: 'textGlow 2s ease-in-out infinite' }}
                  >
                    {codigo}
                  </p>
                </div>
              </div>
            </div>

            {/* Welcome message */}
            <div className="max-w-lg text-center space-y-4">
              <h2
                className="text-5xl font-bold text-[#E8EDFF]"
                style={{ fontFamily: 'var(--font-space-grotesk)', animation: 'fadeInUp 0.6s ease-out 0.2s both' }}
              >
                Aguardando Início
              </h2>
              <p
                className="text-[#8899CC] text-xl"
                style={{ animation: 'fadeInUp 0.6s ease-out 0.4s both' }}
              >
                Escaneie o QR Code ou acesse o endereço acima com o código da sessão para participar
              </p>
              <div
                className="flex items-center justify-center gap-2 pt-2"
                style={{ animation: 'fadeInUp 0.6s ease-out 0.6s both' }}
              >
                <div style={{ animation: 'pulseScale 1.5s ease-in-out infinite' }}>
                  <Users className="w-6 h-6 text-[#C8A84B]" />
                </div>
                <span
                  className="text-[#E8EDFF] text-2xl font-semibold"
                  style={{ fontFamily: 'var(--font-space-grotesk)' }}
                >
                  <AnimatedCounter value={totalParticipants || participantCount} /> {totalParticipants === 1 ? 'participante' : 'participantes'}
                  {totalParticipants > participantCount && participantCount > 0 && (
                    <span className="text-[#C8A84B]/60 text-sm ml-2">({participantCount} conectados)</span>
                  )}
                </span>
              </div>

              {/* Animated dots indicator */}
              <div
                className="flex items-center justify-center gap-1.5 pt-4"
                style={{ animation: 'fadeIn 0.5s ease-out 1s both' }}
              >
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-[#C8A84B]"
                    style={{
                      animation: `dotPulse 1.2s ease-in-out ${i * 0.4}s infinite`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* ── Active Question State ── */
          <div
            key={currentQuestionId || 'question'}
            className="flex-1 flex min-h-0"
            style={{ animation: 'fadeInUp 0.4s ease-out' }}
          >
            {/* Left: Question Text + Image + Alternatives */}
            <div className={`flex flex-col p-6 gap-4 min-h-0 overflow-hidden ${currentQuestion.imageUrl ? 'w-[45%]' : 'w-[55%]'}`}>
              {/* Question number badge */}
              <div className="shrink-0 flex items-center gap-3">
                <span
                  className="px-4 py-1.5 bg-[#00338C] text-white font-bold text-lg rounded-lg"
                  style={{ fontFamily: 'var(--font-space-grotesk)', animation: 'slideInLeft 0.4s ease-out' }}
                >
                  Questao {currentIndex + 1}/{totalQuestions}
                </span>
                <span className="text-[#8899CC] text-sm">{currentQuestion.year} — {currentQuestion.course}</span>
                {revealed && (
                  <span
                    className="px-4 py-1.5 bg-[#C8A84B] text-[#050A1A] font-bold text-lg rounded-lg"
                    style={{ fontFamily: 'var(--font-space-grotesk)', animation: 'bounceScale 0.5s ease-out' }}
                  >
                    Gabarito: {currentQuestion.correctAnswer}
                  </span>
                )}
              </div>

              {/* Question image */}
              {currentQuestion.imageUrl && (
                <div
                  className="shrink-0 max-h-[30%] overflow-hidden rounded-xl border border-[#1A2A5E] bg-[#0D1B3E] flex items-center justify-center"
                  style={{ animation: 'scaleIn 0.4s ease-out 0.1s both' }}
                >
                  <img
                    src={currentQuestion.imageUrl}
                    alt="Imagem da questao"
                    className="max-h-full max-w-full object-contain p-2"
                  />
                </div>
              )}

              {/* Question text */}
              <div
                className="flex-1 min-h-0 overflow-y-auto pr-2"
                style={{ animation: 'fadeInUp 0.5s ease-out 0.15s both' }}
              >
                <p
                  className={`text-[#E8EDFF] leading-relaxed ${currentQuestion.imageUrl ? 'text-xl' : 'text-3xl'}`}
                  style={{ fontFamily: 'var(--font-inter)' }}
                >
                  {currentQuestion.text}
                </p>
              </div>

              {/* Alternatives list — fills space when no image */}
              <div
                className={`shrink-0 ${currentQuestion.imageUrl ? 'space-y-2' : 'space-y-3'}`}
                style={{ animation: 'fadeInUp 0.5s ease-out 0.3s both' }}
              >
                {ALT_LABELS.map((alt, idx) => {
                  const altKey = `alt${alt}` as keyof typeof currentQuestion
                  const isCorrect = revealed && currentQuestion.correctAnswer === alt
                  const isWrong = revealed && !isCorrect
                  return (
                    <div
                      key={alt}
                      className={`flex items-start gap-3 px-4 py-2 rounded-lg border transition-all duration-300 ${
                        isCorrect
                          ? 'bg-[#C8A84B]/15 border-[#C8A84B]/60'
                          : isWrong
                          ? 'bg-[#0D1B3E]/50 border-[#1A2A5E]/50 opacity-40'
                          : 'bg-[#0D1B3E] border-[#1A2A5E]'
                      }`}
                      style={{ animation: `fadeInUp 0.3s ease-out ${0.3 + idx * 0.06}s both` }}
                    >
                      <span
                        className={`shrink-0 ${currentQuestion.imageUrl ? 'w-7 h-7 rounded-md text-sm' : 'w-8 h-8 rounded-lg text-base'} flex items-center justify-center font-bold text-white ${
                          isCorrect ? 'bg-[#C8A84B]' : isWrong ? 'bg-[#3A4A7E]/60' : ''
                        }`}
                        style={!isCorrect && !isWrong ? { backgroundColor: COLORS[alt] } : {}}
                      >
                        {alt}
                      </span>
                      <span className={`leading-snug ${currentQuestion.imageUrl ? 'text-sm' : 'text-base'} ${isCorrect ? 'text-[#E8EDFF]' : isWrong ? 'text-[#8899CC]/50' : 'text-[#C8D0E8]'}`}>
                        {currentQuestion[altKey]}
                      </span>
                      {isCorrect && (
                        <span className="shrink-0 ml-auto text-[#C8A84B] font-bold text-xs border border-[#C8A84B]/40 rounded px-1.5 py-0.5">GABARITO</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Center + Right: Bar Chart */}
            <div
              className={`flex flex-col p-6 min-h-0 ${currentQuestion.imageUrl ? 'w-[55%]' : 'w-[45%]'}`}
              style={{ animation: 'scaleIn 0.5s ease-out 0.1s both' }}
            >
              {/* Gabarito banner when revealed */}
              {revealed && (
                <div
                  className="shrink-0 mb-4 px-6 py-3 bg-[#C8A84B] rounded-xl text-center"
                  style={{ animation: 'slideDown 0.4s ease-out' }}
                >
                  <span
                    className="text-[#050A1A] text-2xl font-bold"
                    style={{ fontFamily: 'var(--font-space-grotesk)' }}
                  >
                    GABARITO: {currentQuestion.correctAnswer}
                  </span>
                </div>
              )}

              {/* Bar chart area */}
              <div className="flex-1 min-h-0 flex flex-col">
                {totalVotes > 0 ? (
                  <div className="flex-1 min-h-0">
                    {renderBarChart()}
                  </div>
                ) : (
                  <div
                    className="flex-1 flex items-center justify-center"
                    style={{ animation: 'fadeInOut 2.5s ease-in-out infinite' }}
                  >
                    <div className="text-center space-y-3">
                      <div className="w-16 h-16 mx-auto rounded-full border-2 border-dashed border-[#1A2A5E] flex items-center justify-center">
                        <div className="w-3 h-3 rounded-full bg-[#C8A84B]/50" style={{ animation: 'dotPulse 1.5s ease-in-out infinite' }} />
                      </div>
                      <p className="text-[#8899CC] text-xl">Aguardando votos...</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Total votes counter */}
              <div
                className="shrink-0 mt-4 text-center"
                key={totalVotes}
                style={{ animation: 'bounceScale 0.3s ease-out' }}
              >
                <div className="flex items-center justify-center gap-2">
                  {totalVotes > 0 && (
                    <div className="w-2 h-2 rounded-full bg-green-400" style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
                  )}
                  <span className="text-[#8899CC] text-lg">
                    Total: <strong className="text-[#E8EDFF] text-xl"><AnimatedCounter value={totalVotes} /></strong> {totalVotes === 1 ? 'resposta' : 'respostas'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom Bar ── */}
      <div className="shrink-0 border-t border-[#1A2A5E] bg-[#0A1128] px-6 py-1.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="UEMS" className="h-5 w-5 object-contain opacity-50" />
          <span className="text-[#3A4A7E] text-xs">UEMS/DIGES — ENADE Quiz</span>
        </div>
        {currentQuestion && (
          <span className="text-[#3A4A7E] text-xs">
            {currentQuestion.year} • {currentQuestion.course}
          </span>
        )}
      </div>
    </div>
  )
}
