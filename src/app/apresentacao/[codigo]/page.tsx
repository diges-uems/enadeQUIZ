'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { io, Socket } from 'socket.io-client'
import { QRCode } from 'react-qrcode-logo'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  KeyRound,
  Users,
  Trophy,
} from 'lucide-react'
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
  const router = useRouter()

  // ── State ──
  const [session, setSession] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [socket, setSocket] = useState<Socket | null>(null)
  const [participantCount, setParticipantCount] = useState(0)
  const [votingPaused, setVotingPaused] = useState(false)
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
  const [isNavigating, setIsNavigating] = useState(false)
  const [ranking, setRanking] = useState<RankingEntry[]>([])
  const [showRanking, setShowRanking] = useState(false)
  const [showFinalRanking, setShowFinalRanking] = useState(false)

  // ── Derived ──
  const currentQuestion = session?.questions.find(
    (q) => q.id === currentQuestionId
  ) ?? null
  const currentIndex = session?.questions.findIndex(
    (q) => q.id === currentQuestionId
  ) ?? -1
  const totalQuestions = session?.questions.length ?? 0
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < totalQuestions - 1 && totalQuestions > 0

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
      setCurrentQuestionId(data.currentQuestionId)
      setVotingPaused(data.votingPaused)
    })

    socketInstance.on('ranking-data', (data: RankingEntry[]) => {
      setRanking(data)
    })

    socketInstance.on('session-finished', () => {
      // Request final ranking before showing end screen
      socketInstance.emit('get-ranking', { sessionCode: codigo })
      setShowFinalRanking(true)
    })

    setSocket(socketInstance)

    return () => {
      socketInstance.disconnect()
    }
  }, [session, codigo])

  // ── Update session on server ──
  const updateSession = async (updates: {
    status?: string
    currentQuestionId?: string | null
  }) => {
    try {
      await fetch(`/api/session/${codigo}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
    } catch (err) {
      console.error('Failed to update session:', err)
    }
  }

  // ── Navigation handlers ──
  const handlePrevious = async () => {
    if (!session || !hasPrev || isNavigating) return
    setIsNavigating(true)
    const prevQuestion = session.questions[currentIndex - 1]
    setCurrentQuestionId(prevQuestion.id)
    setRevealed(prevQuestion.isRevealed)
    setVoteResults({ A: 0, B: 0, C: 0, D: 0, E: 0, total: 0 })
    await updateSession({ currentQuestionId: prevQuestion.id })
    socket?.emit('activate-question', {
      sessionCode: codigo,
      questionId: prevQuestion.id,
    })
    setTimeout(() => setIsNavigating(false), 300)
  }

  const handleNext = async () => {
    if (!session || !hasNext || isNavigating) return
    setIsNavigating(true)
    const nextQuestion = session.questions[currentIndex + 1]
    setCurrentQuestionId(nextQuestion.id)
    setRevealed(nextQuestion.isRevealed)
    setVoteResults({ A: 0, B: 0, C: 0, D: 0, E: 0, total: 0 })
    await updateSession({ currentQuestionId: nextQuestion.id })
    socket?.emit('next-question', {
      sessionCode: codigo,
      questionId: nextQuestion.id,
    })
    setTimeout(() => setIsNavigating(false), 300)
  }

  const handleToggleVoting = () => {
    const newPaused = !votingPaused
    setVotingPaused(newPaused)
    socket?.emit('toggle-voting', {
      sessionCode: codigo,
      paused: newPaused,
    })
  }

  const handleRevealAnswer = async () => {
    if (!currentQuestion) return
    setRevealed(true)
    // Update DB
    await fetch(
      `/api/session/${codigo}/questions/${currentQuestion.id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRevealed: true }),
      }
    )
    socket?.emit('reveal-answer', {
      sessionCode: codigo,
      questionId: currentQuestion.id,
      correctAnswer: currentQuestion.correctAnswer,
    })
  }

  const handleSelectQuestion = async (questionId: string) => {
    if (isNavigating) return
    setIsNavigating(true)
    const q = session?.questions.find((q) => q.id === questionId)
    setCurrentQuestionId(questionId)
    setRevealed(q?.isRevealed ?? false)
    setVoteResults({ A: 0, B: 0, C: 0, D: 0, E: 0, total: 0 })
    await updateSession({ currentQuestionId: questionId })
    socket?.emit('activate-question', {
      sessionCode: codigo,
      questionId,
    })
    setTimeout(() => setIsNavigating(false), 300)
  }

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
        fontSize={14}
        fontWeight="bold"
        style={{ fontFamily: 'var(--font-space-grotesk)' }}
      >
        <tspan x={x} dy="-0.5em">{name}</tspan>
        <tspan x={x} dy="1.2em">{`${(percent * 100).toFixed(0)}%`}</tspan>
      </text>
    )
  }

  // ── Custom tooltip ──
  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { color: string } }> }) => {
    if (active && payload && payload.length) {
      const item = payload[0]
      const pct = totalVotes > 0 ? ((item.value / totalVotes) * 100).toFixed(1) : '0.0'
      return (
        <div className="bg-[#0D1B3E] border border-[#1A2A5E] rounded-lg px-3 py-2 shadow-xl">
          <p className="text-[#E8EDFF] font-bold" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            {item.name} — {pct}%
          </p>
          <p className="text-[#8899CC] text-sm">
            {item.value} {item.value === 1 ? 'voto' : 'votos'}
          </p>
        </div>
      )
    }
    return null
  }

  // ─── Loading state ───
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: '#050A1A' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[#C8A84B] border-t-transparent rounded-full animate-spin" />
          <p className="text-[#E8EDFF] text-lg" style={{ fontFamily: 'var(--font-space-grotesk)' }}>
            Carregando sessão...
          </p>
        </div>
      </div>
    )
  }

  // ─── Not found state ───
  if (notFound || !session) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: '#050A1A' }}>
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
          <button
            onClick={() => router.push('/')}
            className="mt-6 px-6 py-3 bg-[#C8A84B] text-[#050A1A] font-bold rounded-lg hover:bg-[#d4b85c] transition-colors"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            Voltar ao Início
          </button>
        </div>
      </div>
    )
  }

  // ─── No questions state ───
  if (session.questions.length === 0) {
    return (
      <div className="h-screen flex flex-col" style={{ background: '#050A1A' }}>
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-[#1A2A5E]">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="Logo" className="h-8 w-8" />
            <span
              className="text-[#E8EDFF] text-lg font-semibold"
              style={{ fontFamily: 'var(--font-space-grotesk)' }}
            >
              ENADE Quiz
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[#8899CC]">{session.title}</span>
            <span className="px-3 py-1 bg-[#0D1B3E] border border-[#1A2A5E] rounded text-[#C8A84B] font-bold text-sm">
              {codigo}
            </span>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center">
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
      </div>
    )
  }

  // ─── Main presenter screen ───
  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: '#050A1A' }}>
      {/* ── Header Bar ── */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-[#1A2A5E] shrink-0">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="Logo" className="h-8 w-8" />
          <span
            className="text-[#E8EDFF] text-lg font-semibold"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            ENADE Quiz
          </span>
          <span className="text-[#8899CC]">—</span>
          <span className="text-[#8899CC]">{session.title}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="px-3 py-1 bg-[#0D1B3E] border border-[#1A2A5E] rounded text-[#C8A84B] font-bold text-sm tracking-wider">
            {codigo}
          </span>
        </div>
      </header>

      {/* ── Main Content: QR + Chart ── */}
      <div className="flex-1 flex min-h-0">
        {/* Left: QR Code */}
        <div className="w-[380px] shrink-0 flex flex-col items-center justify-center p-6 border-r border-[#1A2A5E]">
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
              logoSize={50}
            />
            <div className="w-full border-t border-[#1A2A5E] pt-4 space-y-2 text-center">
              <p className="text-[#8899CC] text-sm">acesse:</p>
              <p
                className="text-[#E8EDFF] text-lg font-bold"
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                enade.uems.br
              </p>
              <p className="text-[#8899CC] text-sm">código:</p>
              <p
                className="text-[#C8A84B] text-2xl font-bold tracking-widest"
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                {codigo}
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Users className="w-5 h-5 text-[#C8A84B]" />
              <span
                className="text-[#E8EDFF] text-lg font-semibold"
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                {participantCount} {participantCount === 1 ? 'participante' : 'participantes'}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Chart + Legend */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 min-w-0">
          {!currentQuestion ? (
            <div className="text-center space-y-4">
              <h2
                className="text-2xl font-bold text-[#E8EDFF]"
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                Selecione uma questão para começar
              </h2>
              <div className="flex flex-wrap gap-2 justify-center mt-4">
                {session.questions.map((q, idx) => (
                  <button
                    key={q.id}
                    onClick={() => handleSelectQuestion(q.id)}
                    className="px-4 py-2 bg-[#0D1B3E] border border-[#1A2A5E] rounded-lg text-[#E8EDFF] hover:border-[#C8A84B] hover:text-[#C8A84B] transition-colors"
                    style={{ fontFamily: 'var(--font-space-grotesk)' }}
                  >
                    Q{idx + 1}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4">
              {/* Pie Chart */}
              <div className="w-full max-w-md aspect-square">
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        outerRadius="80%"
                        innerRadius="25%"
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
                      <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center space-y-2">
                      <div className="w-24 h-24 mx-auto rounded-full border-4 border-dashed border-[#1A2A5E] flex items-center justify-center">
                        <span className="text-[#8899CC] text-sm">Sem votos</span>
                      </div>
                      <p className="text-[#8899CC] text-sm">Aguardando votos...</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Legend */}
              <div className="grid grid-cols-1 gap-1 w-full max-w-sm">
                {ALT_LABELS.map((alt) => {
                  const votes = voteResults[alt] ?? 0
                  const pct = totalVotes > 0 ? ((votes / totalVotes) * 100).toFixed(0) : '0'
                  const isCorrect = revealed && currentQuestion?.correctAnswer === alt
                  const altKey = `alt${alt}` as 'altA' | 'altB' | 'altC' | 'altD' | 'altE'
                  const altText = currentQuestion ? currentQuestion[altKey] : ''

                  return (
                    <div
                      key={alt}
                      className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-all ${
                        isCorrect
                          ? 'bg-[#C8A84B]/10 border border-[#C8A84B]/40'
                          : revealed
                          ? 'opacity-40'
                          : ''
                      }`}
                    >
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: COLORS[alt] }}
                      />
                      <span
                        className={`font-bold text-sm ${
                          isCorrect ? 'text-[#C8A84B]' : 'text-[#E8EDFF]'
                        }`}
                        style={{ fontFamily: 'var(--font-space-grotesk)' }}
                      >
                        {alt}
                      </span>
                      <span className="text-[#8899CC] text-sm flex-1 truncate">
                        — {altText}
                      </span>
                      <span className="text-[#E8EDFF] font-bold text-sm shrink-0">
                        {pct}%
                      </span>
                      <span className="text-[#8899CC] text-xs shrink-0">
                        ({votes} {votes === 1 ? 'voto' : 'votos'})
                      </span>
                    </div>
                  )
                })}
                <div className="flex justify-center pt-2 border-t border-[#1A2A5E] mt-1">
                  <span className="text-[#8899CC] text-sm">
                    Total: <strong className="text-[#E8EDFF]">{totalVotes}</strong> {totalVotes === 1 ? 'resposta' : 'respostas'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Question Bar ── */}
      <div className="shrink-0 border-t border-[#1A2A5E] bg-[#0D1B3E] px-6 py-4">
        {currentQuestion ? (
          <div className="flex items-start gap-4">
            <span
              className="text-[#C8A84B] font-bold text-lg shrink-0 pt-0.5"
              style={{ fontFamily: 'var(--font-space-grotesk)' }}
            >
              Questão {currentIndex + 1}/{totalQuestions}:
            </span>
            <p className="text-[#E8EDFF] text-base leading-relaxed line-clamp-3">
              {currentQuestion.text}
            </p>
            {revealed && (
              <span className="shrink-0 px-3 py-1 bg-[#C8A84B] text-[#050A1A] font-bold rounded text-sm"
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                Gabarito: {currentQuestion.correctAnswer}
              </span>
            )}
            {votingPaused && !revealed && (
              <span className="shrink-0 px-3 py-1 bg-[#F44336]/20 border border-[#F44336]/40 text-[#F44336] font-bold rounded text-sm"
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                ⏸ Votação pausada
              </span>
            )}
          </div>
        ) : (
          <p className="text-[#8899CC] text-center text-lg">
            Selecione uma questão para começar
          </p>
        )}
      </div>

      {/* ── Control Bar ── */}
      <div className="shrink-0 border-t border-[#1A2A5E] bg-[#0A1128] px-6 py-3">
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {/* Previous */}
          <button
            onClick={handlePrevious}
            disabled={!hasPrev || isNavigating}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-all ${
              hasPrev && !isNavigating
                ? 'bg-[#0D1B3E] border border-[#1A2A5E] text-[#E8EDFF] hover:border-[#C8A84B] hover:text-[#C8A84B]'
                : 'bg-[#0D1B3E]/50 border border-[#1A2A5E]/50 text-[#8899CC]/50 cursor-not-allowed'
            }`}
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            <ChevronLeft className="w-4 h-4" />
            Anterior
          </button>

          {/* Pause/Resume */}
          <button
            onClick={handleToggleVoting}
            disabled={!currentQuestion || revealed}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-all ${
              currentQuestion && !revealed
                ? votingPaused
                  ? 'bg-[#4CAF50] text-[#050A1A] hover:bg-[#66BB6A]'
                  : 'bg-[#F44336] text-white hover:bg-[#EF5350]'
                : 'bg-[#0D1B3E]/50 border border-[#1A2A5E]/50 text-[#8899CC]/50 cursor-not-allowed'
            }`}
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            {votingPaused ? (
              <>
                <Play className="w-4 h-4" />
                Retomar
              </>
            ) : (
              <>
                <Pause className="w-4 h-4" />
                Pausar
              </>
            )}
          </button>

          {/* Next */}
          <button
            onClick={handleNext}
            disabled={!hasNext || isNavigating}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-all ${
              hasNext && !isNavigating
                ? 'bg-[#0D1B3E] border border-[#1A2A5E] text-[#E8EDFF] hover:border-[#C8A84B] hover:text-[#C8A84B]'
                : 'bg-[#0D1B3E]/50 border border-[#1A2A5E]/50 text-[#8899CC]/50 cursor-not-allowed'
            }`}
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            Próxima
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Reveal Answer */}
          <button
            onClick={handleRevealAnswer}
            disabled={!currentQuestion || revealed}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-all ${
              currentQuestion && !revealed
                ? 'bg-[#C8A84B] text-[#050A1A] hover:bg-[#d4b85c]'
                : 'bg-[#0D1B3E]/50 border border-[#1A2A5E]/50 text-[#8899CC]/50 cursor-not-allowed'
            }`}
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            <KeyRound className="w-4 h-4" />
            Gabarito
          </button>

          {/* Winners / Ranking */}
          <button
            onClick={() => {
              socket?.emit('get-ranking', { sessionCode: codigo })
              setShowRanking(true)
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm transition-all bg-[#0D1B3E] border border-[#1A2A5E] text-[#E8EDFF] hover:border-[#C8A84B] hover:text-[#C8A84B]"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            <Trophy className="w-4 h-4" />
            Vencedores
          </button>
        </div>
      </div>

      {/* ── Ranking Overlay ── */}
      <AnimatePresence>
        {showRanking && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(5, 10, 26, 0.92)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              className="bg-[#0D1B3E] border border-[#1A2A5E] rounded-2xl p-8 max-w-lg w-full mx-4 shadow-2xl"
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            >
              {/* Title */}
              <h2
                className="text-2xl font-bold text-center mb-6"
                style={{ fontFamily: 'var(--font-space-grotesk)', color: '#C8A84B' }}
              >
                🏆 Ranking — Top 3
              </h2>

              {/* Ranking list */}
              {ranking.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-[#8899CC] text-lg">Nenhum voto registrado ainda</p>
                </div>
              ) : (
                <div className="space-y-3">
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
                        className={`flex items-center gap-4 p-4 rounded-xl border ${medalColors[idx] || 'border-[#1A2A5E] bg-[#050A1A]'}`}
                        initial={{ x: -40, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ duration: 0.3, delay: idx * 0.15 }}
                      >
                        <span className="text-3xl">{medals[idx]}</span>
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-[#E8EDFF] font-bold text-lg truncate"
                            style={{ fontFamily: 'var(--font-space-grotesk)' }}
                          >
                            {entry.name}
                          </p>
                          <p className="text-[#8899CC] text-sm">RGM: {entry.rgm}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className="text-[#C8A84B] font-bold text-xl"
                            style={{ fontFamily: 'var(--font-space-grotesk)' }}
                          >
                            {entry.corrects}/{totalQuestions}
                          </p>
                          <p className="text-[#8899CC] text-xs">
                            {entry.corrects === 1 ? 'acerto' : 'acertos'}
                          </p>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              )}

              {/* Close button */}
              <div className="mt-6 flex justify-center">
                <button
                  onClick={() => setShowRanking(false)}
                  className="px-6 py-2.5 bg-[#C8A84B] text-[#050A1A] font-bold rounded-lg hover:bg-[#d4b85c] transition-colors text-sm"
                  style={{ fontFamily: 'var(--font-space-grotesk)' }}
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Final Ranking Screen (when session ends) ── */}
      <AnimatePresence>
        {showFinalRanking && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: '#050A1A' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <motion.div
              className="max-w-lg w-full mx-4 text-center"
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            >
              <h1
                className="text-4xl font-bold mb-2"
                style={{ fontFamily: 'var(--font-space-grotesk)', color: '#C8A84B' }}
              >
                🏆 Sessão Encerrada
              </h1>
              <p className="text-[#8899CC] text-lg mb-8">Ranking Final</p>

              {ranking.length === 0 ? (
                <div className="bg-[#0D1B3E] border border-[#1A2A5E] rounded-2xl p-8">
                  <p className="text-[#8899CC] text-lg">Nenhum voto registrado ainda</p>
                </div>
              ) : (
                <div className="space-y-3">
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
                        className={`flex items-center gap-4 p-5 rounded-xl border ${medalColors[idx] || 'border-[#1A2A5E] bg-[#050A1A]'} bg-[#0D1B3E]`}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.4, delay: 0.3 + idx * 0.2 }}
                      >
                        <span className="text-4xl">{medals[idx]}</span>
                        <div className="flex-1 min-w-0 text-left">
                          <p
                            className="text-[#E8EDFF] font-bold text-xl truncate"
                            style={{ fontFamily: 'var(--font-space-grotesk)' }}
                          >
                            {entry.name}
                          </p>
                          <p className="text-[#8899CC] text-sm">RGM: {entry.rgm}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className="text-[#C8A84B] font-bold text-2xl"
                            style={{ fontFamily: 'var(--font-space-grotesk)' }}
                          >
                            {entry.corrects}/{totalQuestions}
                          </p>
                          <p className="text-[#8899CC] text-xs">
                            {entry.corrects === 1 ? 'acerto' : 'acertos'}
                          </p>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              )}

              <div className="mt-8">
                <button
                  onClick={() => router.push('/')}
                  className="px-8 py-3 bg-[#C8A84B] text-[#050A1A] font-bold rounded-xl hover:bg-[#d4b85c] transition-colors text-lg"
                  style={{ fontFamily: 'var(--font-space-grotesk)' }}
                >
                  Voltar ao Início
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
