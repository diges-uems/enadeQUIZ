'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { io, Socket } from 'socket.io-client'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Session, Question } from '@/types'

// ─── Types ──────────────────────────────────────────────────────────────────

type PageState = 'loading' | 'error' | 'waiting' | 'voting' | 'voted' | 'revealed' | 'finished'

interface SessionStatePayload {
  participantCount: number
  currentQuestionId: string | null
  votingPaused: boolean
}

// ─── Alternative colors (subtle indicators per letter) ──────────────────────

const ALT_COLORS: Record<string, string> = {
  A: '#00338C',
  B: '#C8A84B',
  C: '#2196F3',
  D: '#4CAF50',
  E: '#F44336',
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function StudentVotingPage({
  params,
}: {
  params: Promise<{ codigo: string }>
}) {
  const { codigo } = React.use(params)
  const router = useRouter()

  // ── State ───────────────────────────────────────────────────────────────
  const [pageState, setPageState] = useState<PageState>('loading')
  const [session, setSession] = useState<Session | null>(null)
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [selectedChoice, setSelectedChoice] = useState<'A' | 'B' | 'C' | 'D' | 'E' | null>(null)
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null)
  const [votingPaused, setVotingPaused] = useState(false)
  const [participantCount, setParticipantCount] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const socketRef = useRef<Socket | null>(null)

  // ── Anti-fraud: sessionStorage helpers ───────────────────────────────────
  const getStoredVote = useCallback(
    (questionId: string): string | null => {
      if (typeof window === 'undefined') return null
      return sessionStorage.getItem(`voted_${questionId}`)
    },
    []
  )

  const storeVote = useCallback((questionId: string, choice: string) => {
    if (typeof window === 'undefined') return
    sessionStorage.setItem(`voted_${questionId}`, choice)
  }, [])

  // ── Question progress (e.g., "3 / 10") ─────────────────────────────────
  const questionProgress = useCallback((): string => {
    if (!session || !currentQuestion) return ''
    const idx = session.questions.findIndex((q) => q.id === currentQuestion.id)
    if (idx === -1) return ''
    return `${idx + 1} / ${session.questions.length}`
  }, [session, currentQuestion])

  // ── Socket setup & event listeners ──────────────────────────────────────
  useEffect(() => {
    // Fetch session data
    const fetchSession = async () => {
      try {
        const res = await fetch(`/api/session/${codigo}`)
        if (!res.ok) {
          setPageState('error')
          return
        }
        const data: Session = await res.json()
        setSession(data)

        // Connect socket
        const socket = io('/?XTransformPort=3003', {
          transports: ['websocket', 'polling'],
        })
        socketRef.current = socket

        socket.on('connect', () => {
          socket.emit('join-session', { sessionCode: codigo, role: 'student' })
        })

        socket.on('session-state', (state: SessionStatePayload) => {
          setParticipantCount(state.participantCount)
          setVotingPaused(state.votingPaused)

          if (state.currentQuestionId) {
            const q = data.questions.find((q) => q.id === state.currentQuestionId)
            if (q) {
              setCurrentQuestion(q)
              // Check if already voted
              const stored = getStoredVote(q.id)
              if (stored) {
                setSelectedChoice(stored as 'A' | 'B' | 'C' | 'D' | 'E')
                if (q.isRevealed) {
                  setCorrectAnswer(q.correctAnswer)
                  setPageState('revealed')
                } else {
                  setPageState('voted')
                }
              } else if (q.isRevealed) {
                setCorrectAnswer(q.correctAnswer)
                setPageState('revealed')
              } else if (state.votingPaused) {
                setPageState('waiting')
              } else {
                setPageState('voting')
              }
            }
          } else {
            setPageState('waiting')
          }
        })

        socket.on('question-activated', (data: { questionId: string; votingPaused: boolean }) => {
          setSession((prev) => {
            if (prev) {
              const found = prev.questions.find((q) => q.id === data.questionId)
              if (found) {
                setCurrentQuestion(found)
                setVotingPaused(data.votingPaused)
                const stored = getStoredVote(found.id)
                if (stored) {
                  setSelectedChoice(stored as 'A' | 'B' | 'C' | 'D' | 'E')
                  setPageState('voted')
                } else {
                  setSelectedChoice(null)
                  setCorrectAnswer(null)
                  if (data.votingPaused) {
                    setPageState('waiting')
                  } else {
                    setPageState('voting')
                  }
                }
              }
            }
            return prev
          })
        })

        socket.on('vote-accepted', (data: { choice: string; questionId: string }) => {
          setSelectedChoice(data.choice as 'A' | 'B' | 'C' | 'D' | 'E')
          storeVote(data.questionId, data.choice)
          setPageState('voted')
          setIsSubmitting(false)
          toast.success('Voto registrado com sucesso!')
        })

        socket.on('vote-rejected', (data: { reason: string }) => {
          setIsSubmitting(false)
          toast.error(data.reason || 'Voto rejeitado')
        })

        socket.on('answer-revealed', (data: { questionId: string; correctAnswer: string }) => {
          setCorrectAnswer(data.correctAnswer)
          setPageState('revealed')
        })

        socket.on('voting-toggled', (data: { paused: boolean }) => {
          setVotingPaused(data.paused)
          if (data.paused && pageState === 'voting') {
            setPageState('waiting')
          } else if (!data.paused && pageState === 'waiting' && currentQuestion) {
            const stored = getStoredVote(currentQuestion.id)
            if (!stored) {
              setPageState('voting')
            }
          }
        })

        socket.on('session-finished', () => {
          setPageState('finished')
        })

        socket.on('participant-count', (count: number) => {
          setParticipantCount(count)
        })

        socket.on('connect_error', (err) => {
          console.error('Socket connection error:', err)
        })

        socket.on('disconnect', () => {
          console.log('Socket disconnected')
        })
      } catch {
        setPageState('error')
      }
    }

    fetchSession()

    return () => {
      if (socketRef.current) {
        socketRef.current.emit('leave-session', { sessionCode: codigo })
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [codigo, getStoredVote])

  // ── Submit vote ─────────────────────────────────────────────────────────
  const handleVote = useCallback(
    (choice: 'A' | 'B' | 'C' | 'D' | 'E') => {
      if (!currentQuestion || !socketRef.current || isSubmitting) return

      // Anti-fraud: check if already voted
      const stored = getStoredVote(currentQuestion.id)
      if (stored) {
        setSelectedChoice(stored as 'A' | 'B' | 'C' | 'D' | 'E')
        setPageState('voted')
        toast.info('Você já votou nesta questão.')
        return
      }

      setIsSubmitting(true)
      socketRef.current.emit('submit-vote', {
        sessionCode: codigo,
        questionId: currentQuestion.id,
        choice,
      })
    },
    [codigo, currentQuestion, getStoredVote, isSubmitting]
  )

  // ── Get alternative text ────────────────────────────────────────────────
  const getAltText = (letter: string, q: Question): string => {
    switch (letter) {
      case 'A': return q.altA
      case 'B': return q.altB
      case 'C': return q.altC
      case 'D': return q.altD
      case 'E': return q.altE
      default: return ''
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  // Loading state
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="w-10 h-10 border-4 border-[#00338C] border-t-transparent rounded-full mb-4"
        />
        <p className="text-gray-500 text-sm">Carregando sessão...</p>
      </div>
    )
  }

  // Error state
  if (pageState === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white p-6">
        <div className="text-5xl mb-4">😕</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Sessão não encontrada</h1>
        <p className="text-gray-500 text-center text-sm mb-6">
          O código &quot;{codigo}&quot; não corresponde a nenhuma sessão ativa.
          Verifique o QR Code e tente novamente.
        </p>
        <Button
          onClick={() => router.push('/')}
          className="bg-[#00338C] hover:bg-[#002468] text-white"
        >
          Voltar ao início
        </Button>
      </div>
    )
  }

  // Finished state
  if (pageState === 'finished') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white p-6">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className="text-6xl mb-4"
        >
          🎉
        </motion.div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Sessão encerrada!</h1>
        <p className="text-gray-500 text-center text-sm mb-6">
          Obrigado por participar! A sessão foi finalizada pelo apresentador.
        </p>
        <Button
          onClick={() => router.push('/')}
          className="bg-[#00338C] hover:bg-[#002468] text-white"
        >
          Voltar ao início
        </Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="bg-[#00338C] text-white px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm tracking-wide">ENADE Quiz</span>
        </div>
        <div className="flex items-center gap-3 text-xs opacity-80">
          <span>Código: {codigo}</span>
          {participantCount > 0 && (
            <span>👥 {participantCount}</span>
          )}
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col p-4 max-w-lg mx-auto w-full">
        <AnimatePresence mode="wait">
          {/* ── State 1: Waiting ─────────────────────────────────────────── */}
          {pageState === 'waiting' && (
            <motion.div
              key="waiting"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col items-center justify-center text-center"
            >
              <motion.div
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                className="text-6xl mb-6"
              >
                ⏳
              </motion.div>
              <h2 className="text-lg font-semibold text-gray-800 mb-2">
                Aguardando a próxima questão...
              </h2>
              <p className="text-sm text-gray-500">
                O apresentador iniciará a questão em breve.
              </p>
              {votingPaused && currentQuestion && (
                <div className="mt-4 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-amber-700 text-sm font-medium">
                    ⏸ Votação pausada
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {/* ── State 2: Voting ──────────────────────────────────────────── */}
          {pageState === 'voting' && currentQuestion && (
            <motion.div
              key="voting"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col"
            >
              {/* Question header */}
              <div className="mb-4">
                <div className="inline-block bg-[#00338C] text-white text-xs font-bold px-3 py-1 rounded-full mb-3">
                  ENADE {currentQuestion.year} · Q{(session?.questions.findIndex((q) => q.id === currentQuestion.id) ?? -1) + 1}
                </div>
                <h2 className="text-lg font-semibold text-gray-900 leading-snug">
                  {currentQuestion.text}
                </h2>
              </div>

              {/* Optional image */}
              {currentQuestion.imageUrl && (
                <div className="mb-4 rounded-xl overflow-hidden border border-gray-200">
                  <img
                    src={currentQuestion.imageUrl}
                    alt="Imagem da questão"
                    className="w-full h-auto max-h-64 object-contain bg-gray-50"
                  />
                </div>
              )}

              {/* Answer buttons */}
              <div className="flex flex-col gap-3 mt-2">
                {(['A', 'B', 'C', 'D', 'E'] as const).map((letter) => {
                  const altText = getAltText(letter, currentQuestion)
                  const color = ALT_COLORS[letter]
                  return (
                    <motion.button
                      key={letter}
                      whileTap={{ scale: 0.97 }}
                      whileHover={{ scale: 1.01 }}
                      onClick={() => handleVote(letter)}
                      disabled={isSubmitting}
                      className="w-full min-h-14 rounded-xl text-base font-medium flex items-center gap-3 px-4 py-3 border-2 transition-all duration-150 bg-white border-[#00338C] hover:bg-[#00338C] hover:text-white active:bg-[#00338C] active:text-white disabled:opacity-50 disabled:cursor-not-allowed text-left"
                    >
                      <span
                        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 border-2 transition-colors"
                        style={{
                          borderColor: color,
                          color: color,
                          backgroundColor: 'transparent',
                        }}
                      >
                        {letter}
                      </span>
                      <span className="flex-1 leading-snug">{altText}</span>
                    </motion.button>
                  )
                })}
              </div>
            </motion.div>
          )}

          {/* ── State 3: Already voted ───────────────────────────────────── */}
          {pageState === 'voted' && currentQuestion && selectedChoice && (
            <motion.div
              key="voted"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col items-center justify-center text-center"
            >
              <motion.div
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                className="text-6xl mb-6"
              >
                ✅
              </motion.div>
              <h2 className="text-lg font-semibold text-gray-800 mb-2">
                Você votou na alternativa{' '}
                <span
                  className="font-bold text-[#00338C]"
                  style={{ color: ALT_COLORS[selectedChoice] }}
                >
                  {selectedChoice}
                </span>
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Aguardando o gabarito...
              </p>
              <Card className="w-full mt-4">
                <CardContent className="p-4">
                  <p className="text-sm text-gray-600 italic">
                    &quot;{getAltText(selectedChoice, currentQuestion)}&quot;
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* ── State 4: Answer revealed ─────────────────────────────────── */}
          {pageState === 'revealed' && currentQuestion && correctAnswer && (
            <motion.div
              key="revealed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col"
            >
              {/* Correct answer header */}
              <div className="text-center mb-5">
                <div className="inline-block bg-[#C8A84B] text-white text-sm font-bold px-4 py-2 rounded-full">
                  Gabarito: <span className="text-lg">{correctAnswer}</span>
                </div>
              </div>

              {/* All alternatives with results */}
              <div className="flex flex-col gap-2.5">
                {(['A', 'B', 'C', 'D', 'E'] as const).map((letter) => {
                  const altText = getAltText(letter, currentQuestion)
                  const isCorrect = letter === correctAnswer
                  const isStudentChoice = letter === selectedChoice
                  const isWrongChoice = isStudentChoice && !isCorrect

                  let containerClass = 'w-full rounded-xl text-base font-medium flex items-center gap-3 px-4 py-3 border-2 transition-all text-left'
                  let letterBg = 'bg-gray-100 text-gray-500'
                  let iconEl: React.ReactNode = null

                  if (isCorrect) {
                    containerClass += ' bg-green-50 border-[#C8A84B]'
                    letterBg = 'bg-[#C8A84B] text-white'
                    iconEl = <span className="text-green-600 text-lg font-bold">✓</span>
                  } else if (isWrongChoice) {
                    containerClass += ' bg-red-50 border-red-300 opacity-80'
                    letterBg = 'bg-red-500 text-white'
                    iconEl = <span className="text-red-500 text-lg font-bold">✗</span>
                  } else {
                    containerClass += ' bg-gray-50 border-gray-200 opacity-50'
                  }

                  return (
                    <motion.div
                      key={letter}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.05 * ['A','B','C','D','E'].indexOf(letter) }}
                      className={containerClass}
                    >
                      <span
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${letterBg}`}
                      >
                        {letter}
                      </span>
                      <span className={`flex-1 leading-snug ${isCorrect ? 'text-green-800' : isWrongChoice ? 'text-red-700' : 'text-gray-500'}`}>
                        {altText}
                      </span>
                      {iconEl}
                    </motion.div>
                  )
                })}
              </div>

              {/* Result summary */}
              <div className="mt-6 text-center">
                {selectedChoice ? (
                  selectedChoice === correctAnswer ? (
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.4, type: 'spring' }}
                      className="text-lg font-bold text-green-600"
                    >
                      ✅ Você acertou!
                    </motion.div>
                  ) : (
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.4, type: 'spring' }}
                      className="text-lg font-bold text-red-500"
                    >
                      ❌ Você errou
                    </motion.div>
                  )
                ) : (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.4, type: 'spring' }}
                    className="text-base text-gray-500"
                  >
                    Você não votou nesta questão.
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="bg-gray-50 border-t border-gray-200 px-4 py-3 mt-auto">
        <div className="max-w-lg mx-auto flex items-center justify-between text-xs text-gray-400">
          <span>UEMS / DIGES</span>
          <span>
            {currentQuestion ? `Questão ${questionProgress()}` : `Sessão ${codigo}`}
          </span>
        </div>
      </footer>
    </div>
  )
}
