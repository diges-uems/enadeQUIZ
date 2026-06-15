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
        // Reset revealed state when question changes
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

    socketInstance.on('answer-revealed', (data: { correctAnswer: string }) => {
      setRevealed(true)
    })

    socketInstance.on('voting-toggled', (data: { paused: boolean }) => {
      // Just for awareness, no UI controls needed
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

  // ── Custom label renderer for pie slices ──
  const renderCustomLabel = ({
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    name,
    percent,
  }: {
    cx: number
    cy: number
    midAngle: number
    innerRadius: number
    outerRadius: number
    name: string
    percent: number
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
        fontSize={16}
        fontWeight="bold"
        style={{ fontFamily: 'var(--font-space-grotesk)' }}
      >
        <tspan x={x} dy="-0.5em">{name}</tspan>
        <tspan x={x} dy="1.2em">{`${(percent * 100).toFixed(0)}%`}</tspan>
      </text>
    )
  }

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
          className="max-w-xl w-full mx-4 text-center"
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <h1
            className="text-5xl font-bold mb-3"
            style={{ fontFamily: 'var(--font-space-grotesk)', color: '#C8A84B' }}
          >
            Sessão Encerrada
          </h1>
          <p className="text-[#8899CC] text-xl mb-10">Ranking Final</p>

          {ranking.length === 0 ? (
            <div className="bg-[#0D1B3E] border border-[#1A2A5E] rounded-2xl p-8">
              <p className="text-[#8899CC] text-lg">Nenhum voto registrado ainda</p>
            </div>
          ) : (
            <div className="space-y-4">
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
                    className={`flex items-center gap-5 p-5 rounded-xl border ${medalColors[idx] || 'border-[#1A2A5E] bg-[#050A1A]'} bg-[#0D1B3E]`}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.4, delay: 0.3 + idx * 0.2 }}
                  >
                    <span className="text-5xl">{medals[idx]}</span>
                    <div className="flex-1 min-w-0 text-left">
                      <p
                        className="text-[#E8EDFF] font-bold text-2xl truncate"
                        style={{ fontFamily: 'var(--font-space-grotesk)' }}
                      >
                        {entry.name}
                      </p>
                      <p className="text-[#8899CC] text-base">RGM: {entry.rgm}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className="text-[#C8A84B] font-bold text-3xl"
                        style={{ fontFamily: 'var(--font-space-grotesk)' }}
                      >
                        {entry.corrects}/{totalQuestions}
                      </p>
                      <p className="text-[#8899CC] text-sm">
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
      {/* ── Header Bar (thin) ── */}
      <header className="flex items-center justify-between px-8 py-2 border-b border-[#1A2A5E] shrink-0" style={{ background: '#0A1128' }}>
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="UEMS" className="h-8 w-8 object-contain" />
          <span
            className="text-[#E8EDFF] text-xl font-semibold"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            ENADE Quiz
          </span>
          <span className="text-[#3A4A7E]">—</span>
          <span className="text-[#8899CC] text-lg">{session.title}</span>
        </div>
        <span
          className="px-4 py-1 bg-[#0D1B3E] border border-[#1A2A5E] rounded text-[#C8A84B] font-bold text-base tracking-wider"
          style={{ fontFamily: 'var(--font-space-grotesk)' }}
        >
          {codigo}
        </span>
      </header>

      {/* ── Main Content: QR (left) + Chart (right) ── */}
      <div className="flex-1 flex min-h-0">
        {/* Left: QR Code & Session Info */}
        <div className="w-[360px] shrink-0 flex flex-col items-center justify-center p-6 border-r border-[#1A2A5E]">
          <div
            className="bg-[#0D1B3E] border border-[#1A2A5E] rounded-2xl p-5 flex flex-col items-center gap-3"
          >
            <QRCode
              value={`${typeof window !== 'undefined' ? window.location.origin : ''}/votar/${codigo}`}
              size={220}
              bgColor="#0D1B3E"
              fgColor="#E8EDFF"
              qrStyle="dots"
              eyeRadius={8}
              logoImage="/logo.svg"
              logoSize={48}
            />
            <div className="w-full border-t border-[#1A2A5E] pt-3 space-y-1.5 text-center">
              <p className="text-[#8899CC] text-sm">acesse:</p>
              <p
                className="text-[#E8EDFF] text-xl font-bold"
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                enade.uems.br
              </p>
              <p className="text-[#8899CC] text-sm">código:</p>
              <p
                className="text-[#C8A84B] text-3xl font-bold tracking-widest"
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                {codigo}
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Users className="w-6 h-6 text-[#C8A84B]" />
              <span
                className="text-[#E8EDFF] text-xl font-semibold"
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                {participantCount} {participantCount === 1 ? 'participante' : 'participantes'}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Pie Chart + Legend */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 min-w-0">
          <AnimatePresence mode="wait">
            {!currentQuestion ? (
              <motion.div
                key="waiting"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="text-center space-y-4"
              >
                <div className="w-32 h-32 mx-auto rounded-full border-4 border-dashed border-[#1A2A5E] flex items-center justify-center">
                  <span className="text-[#8899CC] text-lg">⏳</span>
                </div>
                <h2
                  className="text-3xl font-bold text-[#E8EDFF]"
                  style={{ fontFamily: 'var(--font-space-grotesk)' }}
                >
                  Aguardando início da apresentação
                </h2>
                <p className="text-[#8899CC] text-lg">
                  O apresentador iniciará em breve
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="chart"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="w-full h-full flex flex-col items-center justify-center gap-3"
              >
                {/* Pie Chart */}
                <div className="w-full max-w-[420px] aspect-square">
                  {pieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          outerRadius="82%"
                          innerRadius="50%"
                          dataKey="value"
                          labelLine={false}
                          label={renderCustomLabel}
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
                                strokeWidth={isCorrect ? 3 : 0}
                                opacity={revealed && !isCorrect ? 0.4 : 1}
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

                {/* Legend */}
                <div className="grid grid-cols-1 gap-1.5 w-full max-w-lg">
                  {ALT_LABELS.map((alt) => {
                    const votes = voteResults[alt] ?? 0
                    const pct = totalVotes > 0 ? ((votes / totalVotes) * 100).toFixed(0) : '0'
                    const isCorrect = revealed && currentQuestion?.correctAnswer === alt

                    return (
                      <motion.div
                        key={alt}
                        className={`flex items-center gap-4 px-5 py-2 rounded-lg transition-all ${
                          isCorrect
                            ? 'bg-[#C8A84B]/10 border-2 border-[#C8A84B]'
                            : revealed
                            ? 'opacity-40 border-2 border-transparent'
                            : 'border-2 border-transparent'
                        }`}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2, delay: ALT_LABELS.indexOf(alt) * 0.05 }}
                      >
                        <span
                          className="w-4 h-4 rounded-full shrink-0"
                          style={{ backgroundColor: COLORS[alt] }}
                        />
                        <span
                          className={`font-bold text-lg ${
                            isCorrect ? 'text-[#C8A84B]' : 'text-[#E8EDFF]'
                          }`}
                          style={{ fontFamily: 'var(--font-space-grotesk)' }}
                        >
                          {alt}
                        </span>
                        <span className="flex-1" />
                        <span className="text-[#E8EDFF] font-bold text-lg shrink-0">
                          {pct}%
                        </span>
                        <span className="text-[#8899CC] text-sm shrink-0">
                          ({votes} {votes === 1 ? 'voto' : 'votos'})
                        </span>
                      </motion.div>
                    )
                  })}
                  <div className="flex justify-center pt-2 border-t border-[#1A2A5E] mt-1">
                    <span className="text-[#8899CC] text-lg">
                      Total: <strong className="text-[#E8EDFF]">{totalVotes}</strong> {totalVotes === 1 ? 'resposta' : 'respostas'}
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Question Bar (bottom) ── */}
      <div className="shrink-0 border-t border-[#1A2A5E] bg-[#0D1B3E] px-8 py-3">
        <AnimatePresence mode="wait">
          {currentQuestion ? (
            <motion.div
              key={currentQuestion.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              className="flex items-center gap-4"
            >
              <span
                className="text-[#C8A84B] font-bold text-2xl shrink-0"
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                Questão {currentIndex + 1}/{totalQuestions}:
              </span>
              {currentQuestion.imageUrl && (
                <img
                  src={currentQuestion.imageUrl}
                  alt="Imagem da questão"
                  className="h-12 w-auto max-w-20 object-contain rounded shrink-0 border border-[#1A2A5E]"
                />
              )}
              <p
                className="text-[#E8EDFF] text-xl leading-relaxed line-clamp-2 flex-1"
                style={{ fontFamily: 'var(--font-inter)' }}
              >
                &ldquo;{currentQuestion.text}&rdquo;
              </p>
              {revealed && (
                <motion.span
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="shrink-0 px-4 py-1.5 bg-[#C8A84B] text-[#050A1A] font-bold rounded text-base"
                  style={{ fontFamily: 'var(--font-space-grotesk)' }}
                >
                  Gabarito: {currentQuestion.correctAnswer}
                </motion.span>
              )}
            </motion.div>
          ) : (
            <motion.p
              key="no-question"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-[#8899CC] text-center text-xl"
            >
              Nenhuma questão ativa
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
