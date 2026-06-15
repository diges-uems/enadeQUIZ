'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { QRCode } from 'react-qrcode-logo'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from 'recharts'
import { Users } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

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
        // Ease out cubic
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
    <motion.span
      className={className}
      style={style}
      key={value}
      initial={{ scale: 1.25 }}
      animate={{ scale: 1 }}
      transition={{ duration: 0.3, type: 'spring', bounce: 0.5 }}
    >
      {displayValue}
    </motion.span>
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
  const [voteResults, setVoteResults] = useState<VoteResults>({
    A: 0,
    B: 0,
    C: 0,
    D: 0,
    E: 0,
    total: 0,
  })
  const [revealed, setRevealed] = useState(false)
  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(null)
  const [ranking, setRanking] = useState<RankingEntry[]>([])
  const [sessionFinished, setSessionFinished] = useState(false)
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

    socketInstance.on('participant-count', (count: number) => {
      setParticipantCount(count)
    })

    socketInstance.on('session-state', (data: {
      participantCount: number
      currentQuestionId: string | null
      votingPaused: boolean
    }) => {
      setParticipantCount(data.participantCount)
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

    setSocket(socketInstance)

    return () => {
      socketInstance.disconnect()
    }
  }, [session, codigo])

  // ── Pie chart data ──
  const pieData = ALT_LABELS.map((alt) => ({
    name: alt,
    value: voteResults[alt] ?? 0,
    color: COLORS[alt],
  })).filter((d) => d.value > 0)

  const totalVotes = voteResults.total || pieData.reduce((sum, d) => sum + d.value, 0)

  // ─── Loading state ───
  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center overflow-hidden" style={{ background: '#050A1A' }}>
        <motion.div
          className="flex flex-col items-center gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            className="w-14 h-14 border-4 border-[#C8A84B] border-t-transparent rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
          <motion.p
            className="text-[#E8EDFF] text-xl"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            Carregando sessão...
          </motion.p>
        </motion.div>
      </div>
    )
  }

  // ─── Not found state ───
  if (notFound || !session) {
    return (
      <div className="h-screen w-screen flex items-center justify-center overflow-hidden" style={{ background: '#050A1A' }}>
        <motion.div
          className="text-center space-y-4"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <motion.h1
            className="text-4xl font-bold text-[#E8EDFF]"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
            initial={{ y: -20 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            Sessão não encontrada
          </motion.h1>
          <p className="text-[#8899CC] text-lg">
            O código &quot;{codigo}&quot; não corresponde a nenhuma sessão ativa.
          </p>
        </motion.div>
      </div>
    )
  }

  // ─── Session Finished State ───
  if (sessionFinished) {
    return (
      <div className="h-screen w-screen flex items-center justify-center overflow-hidden" style={{ background: '#050A1A' }}>
        <motion.div
          className="max-w-2xl w-full mx-4 text-center"
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        >
          {/* Trophy animation */}
          <motion.div
            className="mb-4"
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 0.8, type: 'spring', bounce: 0.5 }}
          >
            <span className="text-7xl">🏆</span>
          </motion.div>

          <motion.h1
            className="text-6xl font-bold mb-3"
            style={{ fontFamily: 'var(--font-space-grotesk)', color: '#C8A84B' }}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            Sessão Encerrada
          </motion.h1>
          <motion.p
            className="text-[#8899CC] text-2xl mb-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            Ranking Final
          </motion.p>

          {ranking.length === 0 ? (
            <motion.div
              className="bg-[#0D1B3E] border border-[#1A2A5E] rounded-2xl p-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              <p className="text-[#8899CC] text-xl">Nenhum voto registrado ainda</p>
            </motion.div>
          ) : (
            <div className="space-y-5">
              {ranking.slice(0, 3).map((entry, idx) => {
                const medals = ['🥇', '🥈', '🥉']
                const medalColors = [
                  'border-[#FFD700] bg-[#FFD700]/10',
                  'border-[#C0C0C0] bg-[#C0C0C0]/10',
                  'border-[#CD7F32] bg-[#CD7F32]/10',
                ]
                return (
                  <motion.div
                    key={entry.rgm}
                    className={`flex items-center gap-6 p-6 rounded-xl border ${medalColors[idx] || 'border-[#1A2A5E] bg-[#050A1A]'} bg-[#0D1B3E]`}
                    initial={{ scale: 0.5, opacity: 0, x: -80 }}
                    animate={{ scale: 1, opacity: 1, x: 0 }}
                    transition={{
                      duration: 0.6,
                      delay: 0.5 + idx * 0.3,
                      type: 'spring',
                      bounce: 0.3,
                    }}
                  >
                    <motion.span
                      className="text-6xl"
                      initial={{ scale: 0, rotate: -360 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ duration: 0.6, delay: 0.7 + idx * 0.3, type: 'spring' }}
                    >
                      {medals[idx]}
                    </motion.span>
                    <div className="flex-1 min-w-0 text-left">
                      <p
                        className="text-[#E8EDFF] font-bold text-3xl truncate"
                        style={{ fontFamily: 'var(--font-space-grotesk)' }}
                      >
                        {entry.name}
                      </p>
                      <p className="text-[#8899CC] text-lg">RGM: {entry.rgm}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <motion.p
                        className="text-[#C8A84B] font-bold text-4xl"
                        style={{ fontFamily: 'var(--font-space-grotesk)' }}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ duration: 0.4, delay: 0.9 + idx * 0.3, type: 'spring', bounce: 0.5 }}
                      >
                        {entry.corrects}/{totalQuestions}
                      </motion.p>
                      <p className="text-[#8899CC] text-base">
                        {entry.corrects === 1 ? 'acerto' : 'acertos'}
                      </p>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}
        </motion.div>
      </div>
    )
  }

  // ─── No questions state ───
  if (session.questions.length === 0) {
    return (
      <div className="h-screen w-screen flex items-center justify-center overflow-hidden" style={{ background: '#050A1A' }}>
        <motion.div
          className="text-center space-y-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h2
            className="text-3xl font-bold text-[#E8EDFF]"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            Nenhuma questão cadastrada
          </h2>
          <p className="text-[#8899CC] text-lg">
            Adicione questões à sessão antes de iniciar a apresentação.
          </p>
        </motion.div>
      </div>
    )
  }

  // ─── Main presenter display (16:9 PowerPoint-style, read-only) ───
  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ background: '#050A1A' }}>
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
          <motion.div
            className="flex items-center gap-1.5"
            key={participantCount}
            initial={{ scale: 1.3 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.3, type: 'spring', bounce: 0.5 }}
          >
            <Users className="w-4 h-4 text-[#C8A84B]" />
            <AnimatedCounter
              value={participantCount}
              className="text-[#E8EDFF] text-base font-medium"
              style={{ fontFamily: 'var(--font-space-grotesk)' }}
            />
          </motion.div>
          <span
            className="px-3 py-0.5 bg-[#0D1B3E] border border-[#1A2A5E] rounded text-[#C8A84B] font-bold text-sm tracking-wider"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            {codigo}
          </span>
        </div>
      </header>

      {/* ── Main Content Area ── */}
      <div className="flex-1 flex min-h-0">
        <AnimatePresence mode="wait">
          {!currentQuestion ? (
            /* ── Waiting State: QR Code Center ── */
            <motion.div
              key="waiting"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.5 }}
              className="flex-1 flex items-center justify-center gap-16 px-12"
            >
              {/* QR Code Section */}
              <div className="flex flex-col items-center gap-6">
                <motion.div
                  className="bg-[#0D1B3E] border border-[#1A2A5E] rounded-2xl p-6 flex flex-col items-center gap-4 relative"
                  animate={{
                    boxShadow: [
                      '0 0 20px rgba(200, 168, 75, 0)',
                      '0 0 40px rgba(200, 168, 75, 0.15)',
                      '0 0 20px rgba(200, 168, 75, 0)',
                    ],
                  }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                >
                  {/* Pulsing border glow */}
                  <motion.div
                    className="absolute inset-0 rounded-2xl border-2 border-[#C8A84B]/30 pointer-events-none"
                    animate={{
                      opacity: [0.3, 0.8, 0.3],
                      scale: [1, 1.01, 1],
                    }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <QRCode
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/votar/${codigo}`}
                    size={280}
                    bgColor="#0D1B3E"
                    fgColor="#E8EDFF"
                    qrStyle="dots"
                    eyeRadius={8}
                    logoImage="/logo.svg"
                    logoSize={56}
                  />
                  <div className="w-full border-t border-[#1A2A5E] pt-4 space-y-2 text-center">
                    <p className="text-[#8899CC] text-base">acesse:</p>
                    <p
                      className="text-[#E8EDFF] text-2xl font-bold"
                      style={{ fontFamily: 'var(--font-space-grotesk)' }}
                    >
                      enade.uems.br
                    </p>
                    <p className="text-[#8899CC] text-base">código:</p>
                    <motion.p
                      className="text-[#C8A84B] text-4xl font-bold tracking-widest"
                      style={{ fontFamily: 'var(--font-space-grotesk)' }}
                      animate={{
                        textShadow: [
                          '0 0 10px rgba(200, 168, 75, 0)',
                          '0 0 20px rgba(200, 168, 75, 0.4)',
                          '0 0 10px rgba(200, 168, 75, 0)',
                        ],
                      }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      {codigo}
                    </motion.p>
                  </div>
                </motion.div>
              </div>

              {/* Welcome message */}
              <div className="max-w-lg text-center space-y-4">
                <motion.h2
                  className="text-5xl font-bold text-[#E8EDFF]"
                  style={{ fontFamily: 'var(--font-space-grotesk)' }}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                >
                  Aguardando Início
                </motion.h2>
                <motion.p
                  className="text-[#8899CC] text-xl"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                >
                  Escaneie o QR Code ou acesse o endereço acima com o código da sessão para participar
                </motion.p>
                <motion.div
                  className="flex items-center justify-center gap-2 pt-2"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.6, delay: 0.6 }}
                >
                  <motion.div
                    animate={{ scale: [1, 1.15, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <Users className="w-6 h-6 text-[#C8A84B]" />
                  </motion.div>
                  <span
                    className="text-[#E8EDFF] text-2xl font-semibold"
                    style={{ fontFamily: 'var(--font-space-grotesk)' }}
                  >
                    <AnimatedCounter value={participantCount} /> {participantCount === 1 ? 'participante' : 'participantes'}
                  </span>
                </motion.div>

                {/* Animated dots indicator */}
                <motion.div
                  className="flex items-center justify-center gap-1.5 pt-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1 }}
                >
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="w-2 h-2 rounded-full bg-[#C8A84B]"
                      animate={{
                        scale: [1, 1.5, 1],
                        opacity: [0.3, 1, 0.3],
                      }}
                      transition={{
                        duration: 1.2,
                        repeat: Infinity,
                        delay: i * 0.4,
                        ease: 'easeInOut',
                      }}
                    />
                  ))}
                </motion.div>
              </div>
            </motion.div>
          ) : (
            /* ── Active Question State ── */
            <motion.div
              key={currentQuestionId || 'question'}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="flex-1 flex min-h-0"
            >
              {/* Left: Question Text + Image */}
              <div className="w-[45%] flex flex-col p-6 gap-4 min-h-0 overflow-hidden">
                {/* Question number badge */}
                <div className="shrink-0 flex items-center gap-3">
                  <motion.span
                    className="px-4 py-1.5 bg-[#00338C] text-white font-bold text-lg rounded-lg"
                    style={{ fontFamily: 'var(--font-space-grotesk)' }}
                    initial={{ x: -30, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ duration: 0.4, type: 'spring', bounce: 0.3 }}
                  >
                    Questão {currentIndex + 1}/{totalQuestions}
                  </motion.span>
                  <AnimatePresence>
                    {revealed && (
                      <motion.span
                        initial={{ scale: 0, rotate: -10 }}
                        animate={{ scale: 1, rotate: 0 }}
                        exit={{ scale: 0 }}
                        transition={{ duration: 0.5, type: 'spring', bounce: 0.6 }}
                        className="px-4 py-1.5 bg-[#C8A84B] text-[#050A1A] font-bold text-lg rounded-lg"
                        style={{ fontFamily: 'var(--font-space-grotesk)' }}
                      >
                        Gabarito: {currentQuestion.correctAnswer}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>

                {/* Question image */}
                {currentQuestion.imageUrl && (
                  <motion.div
                    className="shrink-0 max-h-[35%] overflow-hidden rounded-xl border border-[#1A2A5E] bg-[#0D1B3E] flex items-center justify-center"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                  >
                    <img
                      src={currentQuestion.imageUrl}
                      alt="Imagem da questão"
                      className="max-h-full max-w-full object-contain p-2"
                    />
                  </motion.div>
                )}

                {/* Question text */}
                <motion.div
                  className="flex-1 min-h-0 overflow-y-auto pr-2"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.15 }}
                >
                  <p
                    className="text-[#E8EDFF] text-2xl leading-relaxed"
                    style={{ fontFamily: 'var(--font-inter)' }}
                  >
                    {currentQuestion.text}
                  </p>
                </motion.div>
              </div>

              {/* Center: Pie Chart */}
              <motion.div
                className="w-[30%] flex flex-col items-center justify-center p-4 min-h-0"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                <div className="w-full aspect-square max-w-[400px] max-h-[400px]">
                  {pieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          outerRadius="80%"
                          innerRadius="45%"
                          dataKey="value"
                          labelLine={false}
                          label={({ cx, cy, midAngle, innerRadius, outerRadius, name, percent }: {
                            cx: number; cy: number; midAngle: number; innerRadius: number; outerRadius: number; name: string; percent: number
                          }) => {
                            if (percent < 0.05) return null
                            const RADIAN = Math.PI / 180
                            const radius = innerRadius + (outerRadius - innerRadius) * 0.5
                            const x = cx + radius * Math.cos(-midAngle * RADIAN)
                            const y = cy + radius * Math.sin(-midAngle * RADIAN)
                            return (
                              <text
                                x={x}
                                y={y}
                                fill="#E8EDFF"
                                textAnchor="middle"
                                dominantBaseline="central"
                                fontSize={18}
                                fontWeight="bold"
                                style={{ fontFamily: 'var(--font-space-grotesk)' }}
                              >
                                <tspan x={x} dy="-0.5em">{name}</tspan>
                                <tspan x={x} dy="1.2em">{`${(percent * 100).toFixed(0)}%`}</tspan>
                              </text>
                            )
                          }}
                          isAnimationActive={true}
                          animationDuration={600}
                          animationEasing="ease-out"
                        >
                          {pieData.map((entry, index) => {
                            const isCorrect = revealed && currentQuestion?.correctAnswer === entry.name
                            return (
                              <Cell
                                key={`cell-${index}`}
                                fill={entry.color}
                                stroke={isCorrect ? '#C8A84B' : 'transparent'}
                                strokeWidth={isCorrect ? 4 : 0}
                                opacity={revealed && !isCorrect ? 0.35 : 1}
                              />
                            )
                          })}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <motion.div
                      className="h-full flex items-center justify-center"
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      <div className="text-center space-y-3">
                        <motion.div
                          className="w-28 h-28 mx-auto rounded-full border-4 border-dashed border-[#1A2A5E] flex items-center justify-center"
                          animate={{ rotate: [0, 360] }}
                          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                        >
                          <span className="text-[#8899CC] text-base" style={{ display: 'inline-block', transform: 'rotate(0deg)' }}>Sem votos</span>
                        </motion.div>
                        <p className="text-[#8899CC] text-lg">Aguardando votos...</p>
                      </div>
                    </motion.div>
                  )}
                </div>
                {/* Total votes - animated */}
                <motion.div
                  className="mt-2 text-center"
                  key={totalVotes}
                  initial={{ scale: 1.2 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.3, type: 'spring', bounce: 0.4 }}
                >
                  <span className="text-[#8899CC] text-lg">
                    Total: <strong className="text-[#E8EDFF] text-xl"><AnimatedCounter value={totalVotes} /></strong> {totalVotes === 1 ? 'resposta' : 'respostas'}
                  </span>
                </motion.div>
              </motion.div>

              {/* Right: Alternatives Legend */}
              <div className="w-[25%] flex flex-col justify-center p-4 gap-2 min-h-0 overflow-y-auto">
                <AnimatePresence>
                  {ALT_LABELS.map((alt, idx) => {
                    const altKey = `alt${alt}` as 'altA' | 'altB' | 'altC' | 'altD' | 'altE'
                    const votes = voteResults[alt] ?? 0
                    const pct = totalVotes > 0 ? ((votes / totalVotes) * 100).toFixed(0) : '0'
                    const isCorrect = revealed && currentQuestion?.correctAnswer === alt
                    const altText = currentQuestion?.[altKey] ?? ''

                    return (
                      <motion.div
                        key={alt}
                        className={`rounded-xl px-4 py-3 ${
                          isCorrect
                            ? 'bg-[#C8A84B]/15 border-2 border-[#C8A84B]'
                            : revealed
                            ? 'opacity-35 border-2 border-transparent bg-[#0D1B3E]'
                            : 'border-2 border-transparent bg-[#0D1B3E]'
                        }`}
                        initial={{ opacity: 0, x: 40 }}
                        animate={{
                          opacity: 1,
                          x: 0,
                          scale: isCorrect ? [1, 1.05, 1] : 1,
                        }}
                        transition={{
                          duration: 0.3,
                          delay: idx * 0.08,
                          type: 'spring',
                          bounce: 0.2,
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <motion.span
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-base font-bold text-white shrink-0"
                            style={{ backgroundColor: COLORS[alt] }}
                            animate={isCorrect ? {
                              boxShadow: [
                                '0 0 0px rgba(200, 168, 75, 0)',
                                '0 0 15px rgba(200, 168, 75, 0.6)',
                                '0 0 0px rgba(200, 168, 75, 0)',
                              ],
                            } : {}}
                            transition={{ duration: 1.5, repeat: isCorrect ? Infinity : 0, ease: 'easeInOut' }}
                          >
                            {alt}
                          </motion.span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[#8899CC] text-xs line-clamp-1">{altText}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <motion.span
                              className={`font-bold text-lg ${isCorrect ? 'text-[#C8A84B]' : 'text-[#E8EDFF]'}`}
                              key={`${alt}-${pct}`}
                              initial={{ scale: 1.3 }}
                              animate={{ scale: 1 }}
                              transition={{ duration: 0.2 }}
                            >
                              {pct}%
                            </motion.span>
                            <span className="text-[#8899CC] text-sm ml-1">
                              ({votes})
                            </span>
                          </div>
                        </div>

                        {/* Animated vote bar */}
                        {votes > 0 && (
                          <motion.div
                            className="mt-2 h-1.5 bg-[#1A2A5E] rounded-full overflow-hidden"
                          >
                            <motion.div
                              className="h-full rounded-full"
                              style={{ backgroundColor: COLORS[alt] }}
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.8, ease: 'easeOut', delay: idx * 0.08 + 0.2 }}
                            />
                          </motion.div>
                        )}
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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
