'use client'

import React, { useEffect, useState, useCallback } from 'react'
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
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[#C8A84B] border-t-transparent rounded-full animate-spin" />
          <p className="text-[#E8EDFF] text-xl" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
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
        <div className="text-center space-y-4">
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
        <motion.div
          className="max-w-2xl w-full mx-4 text-center"
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <h1
            className="text-6xl font-bold mb-3"
            style={{ fontFamily: 'var(--font-space-grotesk)', color: '#C8A84B' }}
          >
            Sessão Encerrada
          </h1>
          <p className="text-[#8899CC] text-2xl mb-10">Ranking Final</p>

          {ranking.length === 0 ? (
            <div className="bg-[#0D1B3E] border border-[#1A2A5E] rounded-2xl p-8">
              <p className="text-[#8899CC] text-xl">Nenhum voto registrado ainda</p>
            </div>
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
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.4, delay: 0.3 + idx * 0.2 }}
                  >
                    <span className="text-6xl">{medals[idx]}</span>
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
                      <p
                        className="text-[#C8A84B] font-bold text-4xl"
                        style={{ fontFamily: 'var(--font-space-grotesk)' }}
                      >
                        {entry.corrects}/{totalQuestions}
                      </p>
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
        <div className="text-center space-y-4">
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
          <div className="flex items-center gap-1.5">
            <Users className="w-4 h-4 text-[#C8A84B]" />
            <span className="text-[#E8EDFF] text-base font-medium" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
              {participantCount}
            </span>
          </div>
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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex items-center justify-center gap-16 px-12"
            >
              {/* QR Code Section */}
              <div className="flex flex-col items-center gap-6">
                <div
                  className="bg-[#0D1B3E] border border-[#1A2A5E] rounded-2xl p-6 flex flex-col items-center gap-4"
                >
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
                    <p
                      className="text-[#C8A84B] text-4xl font-bold tracking-widest"
                      style={{ fontFamily: 'var(--font-space-grotesk)' }}
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
                  style={{ fontFamily: 'var(--font-space-grotesk)' }}
                >
                  Aguardando Início
                </h2>
                <p className="text-[#8899CC] text-xl">
                  Escaneie o QR Code ou acesse o endereço acima com o código da sessão para participar
                </p>
                <div className="flex items-center justify-center gap-2 pt-2">
                  <Users className="w-6 h-6 text-[#C8A84B]" />
                  <span
                    className="text-[#E8EDFF] text-2xl font-semibold"
                    style={{ fontFamily: 'var(--font-space-grotesk)' }}
                  >
                    {participantCount} {participantCount === 1 ? 'participante' : 'participantes'}
                  </span>
                </div>
              </div>
            </motion.div>
          ) : (
            /* ── Active Question State ── */
            <motion.div
              key="question"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex min-h-0"
            >
              {/* Left: Question Text + Image */}
              <div className="w-[45%] flex flex-col p-6 gap-4 min-h-0 overflow-hidden">
                {/* Question number badge */}
                <div className="shrink-0 flex items-center gap-3">
                  <span
                    className="px-4 py-1.5 bg-[#00338C] text-white font-bold text-lg rounded-lg"
                    style={{ fontFamily: 'var(--font-space-grotesk)' }}
                  >
                    Questão {currentIndex + 1}/{totalQuestions}
                  </span>
                  {revealed && (
                    <motion.span
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="px-4 py-1.5 bg-[#C8A84B] text-[#050A1A] font-bold text-lg rounded-lg"
                      style={{ fontFamily: 'var(--font-space-grotesk)' }}
                    >
                      Gabarito: {currentQuestion.correctAnswer}
                    </motion.span>
                  )}
                </div>

                {/* Question image */}
                {currentQuestion.imageUrl && (
                  <div className="shrink-0 max-h-[35%] overflow-hidden rounded-xl border border-[#1A2A5E] bg-[#0D1B3E] flex items-center justify-center">
                    <img
                      src={currentQuestion.imageUrl}
                      alt="Imagem da questão"
                      className="max-h-full max-w-full object-contain p-2"
                    />
                  </div>
                )}

                {/* Question text */}
                <div className="flex-1 min-h-0 overflow-y-auto pr-2">
                  <p
                    className="text-[#E8EDFF] text-2xl leading-relaxed"
                    style={{ fontFamily: 'var(--font-inter)' }}
                  >
                    {currentQuestion.text}
                  </p>
                </div>
              </div>

              {/* Center: Pie Chart */}
              <div className="w-[30%] flex flex-col items-center justify-center p-4 min-h-0">
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
                          animationDuration={300}
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
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center space-y-3">
                        <div className="w-28 h-28 mx-auto rounded-full border-4 border-dashed border-[#1A2A5E] flex items-center justify-center">
                          <span className="text-[#8899CC] text-base">Sem votos</span>
                        </div>
                        <p className="text-[#8899CC] text-lg">Aguardando votos...</p>
                      </div>
                    </div>
                  )}
                </div>
                {/* Total votes */}
                <div className="mt-2 text-center">
                  <span className="text-[#8899CC] text-lg">
                    Total: <strong className="text-[#E8EDFF] text-xl">{totalVotes}</strong> {totalVotes === 1 ? 'resposta' : 'respostas'}
                  </span>
                </div>
              </div>

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
                        className={`rounded-xl px-4 py-3 transition-all ${
                          isCorrect
                            ? 'bg-[#C8A84B]/15 border-2 border-[#C8A84B]'
                            : revealed
                            ? 'opacity-35 border-2 border-transparent bg-[#0D1B3E]'
                            : 'border-2 border-transparent bg-[#0D1B3E]'
                        }`}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2, delay: idx * 0.05 }}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-base font-bold text-white shrink-0"
                            style={{ backgroundColor: COLORS[alt] }}
                          >
                            {alt}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[#8899CC] text-xs line-clamp-1">{altText}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <span className={`font-bold text-lg ${isCorrect ? 'text-[#C8A84B]' : 'text-[#E8EDFF]'}`}>
                              {pct}%
                            </span>
                            <span className="text-[#8899CC] text-sm ml-1">
                              ({votes})
                            </span>
                          </div>
                        </div>
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
