'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { io, Socket } from 'socket.io-client'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Users, Wifi, WifiOff } from 'lucide-react'
import type { Session, Question } from '@/types'

// ─── Types ──────────────────────────────────────────────────────────────────

type PageState = 'loading' | 'error' | 'identification' | 'waiting' | 'voting' | 'voted' | 'revealed' | 'finished'

interface SessionStatePayload {
  participantCount: number
  currentQuestionId: string | null
  votingPaused: boolean
}

interface StudentInfo {
  name: string
  rgm: string
  studentId: string
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
  const [isConnected, setIsConnected] = useState(false)

  // ── Student identification state ────────────────────────────────────────
  const [studentName, setStudentName] = useState('')
  const [studentRgm, setStudentRgm] = useState('')
  const [studentId, setStudentId] = useState<string | null>(null)
  const [isRegistering, setIsRegistering] = useState(false)
  const [nameError, setNameError] = useState('')
  const [rgmError, setRgmError] = useState('')

  const socketRef = useRef<Socket | null>(null)
  const sessionFetchedRef = useRef<Session | null>(null)

  // ── Score tracking ──────────────────────────────────────────────────────
  const [correctCount, setCorrectCount] = useState(0)
  const [answeredCount, setAnsweredCount] = useState(0)

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

  // ── Student info from sessionStorage ────────────────────────────────────
  const getStoredStudent = useCallback((): StudentInfo | null => {
    if (typeof window === 'undefined') return null
    const stored = sessionStorage.getItem(`student_${codigo}`)
    if (stored) {
      try {
        return JSON.parse(stored) as StudentInfo
      } catch {
        return null
      }
    }
    return null
  }, [codigo])

  const storeStudent = useCallback((info: StudentInfo) => {
    if (typeof window === 'undefined') return
    sessionStorage.setItem(`student_${codigo}`, JSON.stringify(info))
  }, [codigo])

  // ── Score from sessionStorage ────────────────────────────────────────────
  const loadScore = useCallback((): { correct: number; answered: number } => {
    if (typeof window === 'undefined') return { correct: 0, answered: 0 }
    const stored = sessionStorage.getItem(`score_${codigo}`)
    if (stored) {
      try {
        return JSON.parse(stored) as { correct: number; answered: number }
      } catch {
        return { correct: 0, answered: 0 }
      }
    }
    return { correct: 0, answered: 0 }
  }, [codigo])

  const saveScore = useCallback((correct: number, answered: number) => {
    if (typeof window === 'undefined') return
    sessionStorage.setItem(`score_${codigo}`, JSON.stringify({ correct, answered }))
  }, [codigo])

  // ── Question progress (e.g., "3 / 10") ─────────────────────────────────
  const questionProgress = useCallback((): string => {
    if (!session || !currentQuestion) return ''
    const idx = session.questions.findIndex((q) => q.id === currentQuestion.id)
    if (idx === -1) return ''
    return `${idx + 1} / ${session.questions.length}`
  }, [session, currentQuestion])

  // ── Question progress fraction ─────────────────────────────────────────
  const questionProgressPercent = useCallback((): number => {
    if (!session || !currentQuestion) return 0
    const idx = session.questions.findIndex((q) => q.id === currentQuestion.id)
    if (idx === -1) return 0
    return ((idx + 1) / session.questions.length) * 100
  }, [session, currentQuestion])

  // ── Handle student registration ─────────────────────────────────────────
  const handleRegister = useCallback(async () => {
    // Validate
    let valid = true
    setNameError('')
    setRgmError('')

    if (!studentName.trim()) {
      setNameError('Nome é obrigatório')
      valid = false
    }

    if (!studentRgm.trim()) {
      setRgmError('RGM é obrigatório')
      valid = false
    } else if (!/^\d+$/.test(studentRgm.trim())) {
      setRgmError('RGM deve conter apenas números')
      valid = false
    }

    if (!valid) return

    setIsRegistering(true)

    try {
      // Register student via API
      const res = await fetch('/api/student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionCode: codigo,
          name: studentName.trim(),
          rgm: studentRgm.trim(),
        }),
      })

      if (!res.ok) {
        toast.error('Erro ao registrar. Tente novamente.')
        setIsRegistering(false)
        return
      }

      const data = await res.json()
      const sid = data.student.id

      // Store student info
      const info: StudentInfo = {
        name: studentName.trim(),
        rgm: studentRgm.trim(),
        studentId: sid,
      }
      setStudentId(sid)
      storeStudent(info)

      // Register with socket
      if (socketRef.current) {
        socketRef.current.emit('join-session', {
          sessionCode: codigo,
          role: 'student',
          name: studentName.trim(),
          rgm: studentRgm.trim(),
        })
        socketRef.current.emit('register-student', {
          sessionCode: codigo,
          name: studentName.trim(),
          rgm: studentRgm.trim(),
        })
      }

      toast.success(`Bem-vindo(a), ${studentName.trim()}!`)

      // Transition to waiting state immediately (don't wait for socket confirmation)
      const sessionData = sessionFetchedRef.current
      if (sessionData?.currentQuestionId) {
        const q = sessionData.questions.find((q) => q.id === sessionData.currentQuestionId)
        if (q) {
          setCurrentQuestion(q)
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
          } else {
            setPageState('voting')
          }
        } else {
          setPageState('waiting')
        }
      } else {
        setPageState('waiting')
      }
    } catch {
      toast.error('Erro de conexão. Tente novamente.')
    } finally {
      setIsRegistering(false)
    }
  }, [codigo, studentName, studentRgm, storeStudent])

  // ── Socket setup & event listeners ──────────────────────────────────────
  useEffect(() => {
    // Check if student is already registered
    const storedStudent = getStoredStudent()
    if (storedStudent) {
      setStudentName(storedStudent.name)
      setStudentRgm(storedStudent.rgm)
      setStudentId(storedStudent.studentId)
    }

    // Load score from session
    const score = loadScore()
    setCorrectCount(score.correct)
    setAnsweredCount(score.answered)

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
        sessionFetchedRef.current = data

        // Show identification or waiting screen immediately (don't wait for socket)
        const storedStudent = getStoredStudent()
        if (!storedStudent) {
          setPageState('identification')
        } else {
          // Student already registered, check current state
          if (data.currentQuestionId) {
            const q = data.questions.find((q) => q.id === data.currentQuestionId)
            if (q) {
              setCurrentQuestion(q)
              const storedVote = getStoredVote(q.id)
              if (storedVote) {
                setSelectedChoice(storedVote as 'A' | 'B' | 'C' | 'D' | 'E')
                if (q.isRevealed) {
                  setCorrectAnswer(q.correctAnswer)
                  setPageState('revealed')
                } else {
                  setPageState('voted')
                }
              } else if (q.isRevealed) {
                setCorrectAnswer(q.correctAnswer)
                setPageState('revealed')
              } else {
                setPageState('voting')
              }
            }
          } else {
            setPageState('waiting')
          }
        }

        // Connect socket (non-blocking - UI already shown)
        const socket = io('/?XTransformPort=3003', {
          transports: ['websocket', 'polling'],
          timeout: 10000,
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 2000,
        })
        socketRef.current = socket

        socket.on('connect', () => {
          setIsConnected(true)
          const student = getStoredStudent()
          if (student) {
            // Already registered, just join
            socket.emit('join-session', {
              sessionCode: codigo,
              role: 'student',
              name: student.name,
              rgm: student.rgm,
            })
            socket.emit('register-student', {
              sessionCode: codigo,
              name: student.name,
              rgm: student.rgm,
            })
          } else {
            // Not registered yet, just join the room for state updates
            socket.emit('join-session', { sessionCode: codigo, role: 'student' })
          }
        })

        socket.on('session-state', (state: SessionStatePayload) => {
          setParticipantCount(state.participantCount)
          setVotingPaused(state.votingPaused)

          const student = getStoredStudent()
          if (!student) {
            // Show identification screen
            setPageState('identification')
            return
          }

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

        socket.on('student-registered', () => {
          // After registration is confirmed, transition to appropriate state
          const currentQ = sessionFetchedRef.current
          if (currentQ) {
            const activeQId = sessionCurrentQuestionRef.current
            if (activeQId) {
              const q = currentQ.questions.find((q) => q.id === activeQId)
              if (q) {
                setCurrentQuestion(q)
                const stored = getStoredVote(q.id)
                if (stored) {
                  setSelectedChoice(stored as 'A' | 'B' | 'C' | 'D' | 'E')
                  setPageState('voted')
                } else {
                  setPageState('voting')
                }
              } else {
                setPageState('waiting')
              }
            } else {
              setPageState('waiting')
            }
          } else {
            setPageState('waiting')
          }
        })

        socket.on('question-activated', (data: { questionId: string; votingPaused: boolean }) => {
          const student = getStoredStudent()
          if (!student) {
            setPageState('identification')
            return
          }

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

        socket.on('vote-accepted', async (data: { choice: string; questionId: string }) => {
          setSelectedChoice(data.choice as 'A' | 'B' | 'C' | 'D' | 'E')
          storeVote(data.questionId, data.choice)
          setPageState('voted')
          setIsSubmitting(false)
          toast.success('Voto registrado com sucesso!')

          // Also persist to DB via API
          const student = getStoredStudent()
          if (student?.studentId) {
            try {
              await fetch('/api/vote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  sessionCode: codigo,
                  questionId: data.questionId,
                  choice: data.choice,
                  studentId: student.studentId,
                }),
              })
            } catch (err) {
              console.error('Failed to persist vote to DB:', err)
            }
          }
        })

        socket.on('vote-rejected', (data: { reason: string }) => {
          setIsSubmitting(false)
          toast.error(data.reason || 'Voto rejeitado')
        })

        socket.on('answer-revealed', (data: { questionId: string; correctAnswer: string }) => {
          setCorrectAnswer(data.correctAnswer)
          setPageState('revealed')

          // Update score tracking
          const currentStoredVote = getStoredVote(data.questionId)
          if (currentStoredVote) {
            const newAnswered = answeredCount + 1
            const newCorrect = data.correctAnswer === currentStoredVote ? correctCount + 1 : correctCount
            setAnsweredCount(newAnswered)
            setCorrectCount(newCorrect)
            saveScore(newCorrect, newAnswered)
          }
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

        socket.on('connect_error', () => {
          setIsConnected(false)
        })

        socket.on('disconnect', () => {
          setIsConnected(false)
        })

        socket.on('reconnect', () => {
          setIsConnected(true)
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
  }, [codigo, getStoredVote, getStoredStudent, storeVote])

  // Track current question ID for student-registered handler
  const sessionCurrentQuestionRef = useRef<string | null>(null)
  useEffect(() => {
    sessionCurrentQuestionRef.current = currentQuestion?.id || null
  }, [currentQuestion])

  // ── Submit vote ─────────────────────────────────────────────────────────
  const handleVote = useCallback(
    (choice: 'A' | 'B' | 'C' | 'D' | 'E') => {
      if (!currentQuestion || !socketRef.current || isSubmitting) return

      const student = getStoredStudent()
      if (!student) {
        setPageState('identification')
        return
      }

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
        studentId: student.rgm,
      })
    },
    [codigo, currentQuestion, getStoredVote, getStoredStudent, isSubmitting]
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
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: '#050A1A' }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="w-12 h-12 border-4 border-[#C8A84B] border-t-transparent rounded-full mb-4"
        />
        <motion.p
          className="text-[#8899CC] text-base"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          Carregando sessão...
        </motion.p>
      </div>
    )
  }

  // Error state
  if (pageState === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: '#050A1A' }}>
        <motion.div
          className="text-center space-y-4"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            className="text-5xl mb-2"
            initial={{ y: -20 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            😕
          </motion.div>
          <h1
            className="text-2xl font-bold text-[#E8EDFF]"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            Sessão não encontrada
          </h1>
          <p className="text-[#8899CC] text-sm max-w-sm mx-auto">
            O código &quot;{codigo}&quot; não corresponde a nenhuma sessão ativa.
            Verifique o QR Code e tente novamente.
          </p>
          <Button
            onClick={() => router.push('/')}
            className="bg-[#C8A84B] hover:bg-[#B8983B] text-[#050A1A] font-semibold px-6"
          >
            Voltar ao início
          </Button>
        </motion.div>
      </div>
    )
  }

  // Finished state
  if (pageState === 'finished') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: '#050A1A' }}>
        <motion.div
          className="max-w-sm w-full text-center"
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
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
            className="text-3xl font-bold mb-2"
            style={{ fontFamily: 'var(--font-space-grotesk)', color: '#C8A84B' }}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            Sessão Encerrada
          </motion.h1>

          <motion.p
            className="text-[#8899CC] text-base mb-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            Obrigado por participar, {studentName || 'estudante'}!
          </motion.p>

          {answeredCount > 0 && (
            <motion.div
              className="mb-6"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.6 }}
            >
              <span
                className="inline-block px-4 py-1.5 bg-[#0D1B3E] border border-[#1A2A5E] rounded-full text-[#C8A84B] font-bold text-lg"
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                {correctCount}/{answeredCount} acertos
              </span>
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.7 }}
          >
            <Button
              onClick={() => router.push('/')}
              className="bg-[#C8A84B] hover:bg-[#B8983B] text-[#050A1A] font-semibold px-6"
            >
              Voltar ao início
            </Button>
          </motion.div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#050A1A' }}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-[#1A2A5E] shrink-0" style={{ background: '#0A1128' }}>
        <div className="flex items-center gap-2.5">
          <img src="/logo.svg" alt="UEMS" className="h-7 w-7 object-contain" />
          <span
            className="text-[#E8EDFF] text-sm font-semibold"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            ENADE Quiz
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Score badge - shown when student has answered questions correctly */}
          {answeredCount > 0 && pageState !== 'identification' && (
            <motion.span
              className="px-2.5 py-0.5 bg-[#C8A84B]/15 border border-[#C8A84B]/40 rounded-full text-[#C8A84B] text-xs font-bold"
              style={{ fontFamily: 'var(--font-space-grotesk)' }}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', bounce: 0.4 }}
            >
              {correctCount} acerto{correctCount !== 1 ? 's' : ''}
            </motion.span>
          )}

          {/* Participant count */}
          {participantCount > 0 && pageState !== 'identification' && (
            <div className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-[#C8A84B]" />
              <span className="text-[#E8EDFF] text-xs font-medium">{participantCount}</span>
            </div>
          )}

          {/* Session code badge */}
          <span
            className="px-2.5 py-0.5 bg-[#0D1B3E] border border-[#1A2A5E] rounded text-[#C8A84B] font-bold text-xs tracking-wider"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            {codigo}
          </span>

          {/* Connection status indicator */}
          <motion.div
            className="relative"
            animate={{ scale: isConnected ? 1 : [1, 1.2, 1] }}
            transition={isConnected ? {} : { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            {isConnected ? (
              <Wifi className="w-4 h-4 text-green-400" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-400" />
            )}
          </motion.div>
        </div>
      </header>

      {/* ── Question progress bar ───────────────────────────────────────── */}
      {(pageState === 'voting' || pageState === 'voted' || pageState === 'revealed') && session && currentQuestion && (
        <div className="h-1 bg-[#0D1B3E] shrink-0">
          <motion.div
            className="h-full bg-[#C8A84B]"
            initial={{ width: 0 }}
            animate={{ width: `${questionProgressPercent()}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      )}

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col p-4 max-w-lg mx-auto w-full">
        <AnimatePresence mode="wait">
          {/* ── State 0: Identification ─────────────────────────────────── */}
          {pageState === 'identification' && (
            <motion.div
              key="identification"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="flex-1 flex flex-col items-center justify-center"
            >
              <div className="w-full max-w-sm">
                {/* UEMS branding */}
                <div className="text-center mb-8">
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1, type: 'spring' }}
                    className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-[#0D1B3E] border border-[#1A2A5E] mb-4"
                  >
                    <img src="/logo.svg" alt="UEMS" className="h-12 w-12 object-contain" />
                  </motion.div>
                  <h1
                    className="text-2xl font-bold text-[#E8EDFF] mb-1"
                    style={{ fontFamily: 'var(--font-space-grotesk)' }}
                  >
                    ENADE Quiz
                  </h1>
                  <p className="text-[#8899CC] text-sm">
                    Identifique-se para participar da sessão
                  </p>
                </div>

                {/* Dark card with glow effect */}
                <motion.div
                  className="bg-[#0D1B3E] border border-[#1A2A5E] rounded-2xl p-6 relative"
                  animate={{
                    boxShadow: [
                      '0 0 20px rgba(200, 168, 75, 0)',
                      '0 0 40px rgba(200, 168, 75, 0.1)',
                      '0 0 20px rgba(200, 168, 75, 0)',
                    ],
                  }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                >
                  {/* Pulsing border glow */}
                  <motion.div
                    className="absolute inset-0 rounded-2xl border-2 border-[#C8A84B]/20 pointer-events-none"
                    animate={{
                      opacity: [0.2, 0.6, 0.2],
                      scale: [1, 1.005, 1],
                    }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                  />

                  <div className="space-y-4 relative z-10">
                    {/* Name field */}
                    <div>
                      <label
                        htmlFor="student-name"
                        className="block text-sm font-medium text-[#8899CC] mb-1.5"
                      >
                        Nome completo
                      </label>
                      <Input
                        id="student-name"
                        type="text"
                        placeholder="Digite seu nome completo"
                        value={studentName}
                        onChange={(e) => {
                          setStudentName(e.target.value)
                          if (nameError) setNameError('')
                        }}
                        className={`h-12 text-base bg-[#050A1A] border-[#1A2A5E] text-[#E8EDFF] placeholder:text-[#5A6A9E] focus-visible:ring-[#C8A84B] focus-visible:border-[#C8A84B] ${nameError ? 'border-red-500 focus-visible:ring-red-500 focus-visible:border-red-500' : ''}`}
                        disabled={isRegistering}
                        autoComplete="name"
                      />
                      {nameError && (
                        <p className="text-red-400 text-xs mt-1">{nameError}</p>
                      )}
                    </div>

                    {/* RGM field */}
                    <div>
                      <label
                        htmlFor="student-rgm"
                        className="block text-sm font-medium text-[#8899CC] mb-1.5"
                      >
                        RGM
                        <span className="text-[#5A6A9E] font-normal ml-1">
                          (Registro Geral Matrícula)
                        </span>
                      </label>
                      <Input
                        id="student-rgm"
                        type="text"
                        inputMode="numeric"
                        placeholder="Somente números"
                        value={studentRgm}
                        onChange={(e) => {
                          setStudentRgm(e.target.value)
                          if (rgmError) setRgmError('')
                        }}
                        className={`h-12 text-base bg-[#050A1A] border-[#1A2A5E] text-[#E8EDFF] placeholder:text-[#5A6A9E] focus-visible:ring-[#C8A84B] focus-visible:border-[#C8A84B] ${rgmError ? 'border-red-500 focus-visible:ring-red-500 focus-visible:border-red-500' : ''}`}
                        disabled={isRegistering}
                        autoComplete="off"
                      />
                      {rgmError && (
                        <p className="text-red-400 text-xs mt-1">{rgmError}</p>
                      )}
                    </div>

                    {/* Submit button */}
                    <Button
                      onClick={handleRegister}
                      disabled={isRegistering}
                      className="w-full h-12 text-base font-semibold bg-[#C8A84B] hover:bg-[#B8983B] text-[#050A1A] mt-2"
                    >
                      {isRegistering ? (
                        <span className="flex items-center gap-2">
                          <motion.span
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                            className="inline-block w-4 h-4 border-2 border-[#050A1A] border-t-transparent rounded-full"
                          />
                          Registrando...
                        </span>
                      ) : (
                        'Participar'
                      )}
                    </Button>
                  </div>
                </motion.div>

                <p className="text-center text-xs text-[#5A6A9E] mt-4">
                  UEMS — Universidade Estadual de Mato Grosso do Sul
                </p>
              </div>
            </motion.div>
          )}

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
              {/* Pulsing dots animation */}
              <motion.div
                className="flex items-center justify-center gap-2 mb-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-3 h-3 rounded-full bg-[#C8A84B]"
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

              <h2
                className="text-lg font-semibold text-[#E8EDFF] mb-2"
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                Aguardando a próxima questão...
              </h2>
              <p className="text-sm text-[#8899CC]">
                O apresentador iniciará a questão em breve.
              </p>
              {votingPaused && currentQuestion && (
                <div className="mt-4 px-4 py-2 bg-[#C8A84B]/10 border border-[#C8A84B]/30 rounded-lg">
                  <p className="text-[#C8A84B] text-sm font-medium">
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
                <h2
                  className="text-lg font-semibold text-[#E8EDFF] leading-snug"
                  style={{ fontFamily: 'var(--font-inter)' }}
                >
                  {currentQuestion.text}
                </h2>
              </div>

              {/* Optional image */}
              {currentQuestion.imageUrl && (
                <div className="mb-4 rounded-xl overflow-hidden border border-[#1A2A5E] bg-[#0D1B3E]">
                  <img
                    src={currentQuestion.imageUrl}
                    alt="Imagem da questão"
                    className="w-full h-auto max-h-64 object-contain p-2"
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
                      className="w-full min-h-14 rounded-xl text-base font-medium flex items-center gap-3 px-4 py-3 border-2 transition-all duration-150 bg-[#0D1B3E] border-[#1A2A5E] hover:border-[#C8A84B] hover:shadow-[0_0_15px_rgba(200,168,75,0.15)] active:bg-[#1A2A5E] disabled:opacity-50 disabled:cursor-not-allowed text-left"
                    >
                      <span
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold text-white shrink-0"
                        style={{ backgroundColor: color }}
                      >
                        {letter}
                      </span>
                      <span className="flex-1 leading-snug text-[#E8EDFF]">{altText}</span>
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
              {/* Gold checkmark animation */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                className="mb-6"
              >
                <motion.div
                  className="w-20 h-20 rounded-full bg-[#C8A84B]/15 border-2 border-[#C8A84B] flex items-center justify-center"
                  animate={{
                    boxShadow: [
                      '0 0 0px rgba(200, 168, 75, 0)',
                      '0 0 25px rgba(200, 168, 75, 0.3)',
                      '0 0 0px rgba(200, 168, 75, 0)',
                    ],
                  }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <span className="text-[#C8A84B] text-3xl font-bold">✓</span>
                </motion.div>
              </motion.div>

              <h2
                className="text-lg font-semibold text-[#E8EDFF] mb-2"
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                Você votou na alternativa{' '}
                <span
                  className="font-bold text-[#C8A84B]"
                >
                  {selectedChoice}
                </span>
                {studentName && (
                  <span className="text-[#8899CC] font-normal">, {studentName}</span>
                )}
              </h2>

              {/* Timer indicator with pulsing circle */}
              <div className="flex items-center justify-center gap-2 mb-4">
                <motion.div
                  className="w-2 h-2 rounded-full bg-[#C8A84B]"
                  animate={{
                    scale: [1, 1.4, 1],
                    opacity: [0.5, 1, 0.5],
                  }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                />
                <p className="text-sm text-[#8899CC]">
                  Aguardando o gabarito...
                </p>
              </div>

              {/* Dark card for selected answer display */}
              <div className="w-full mt-4 bg-[#0D1B3E] border border-[#1A2A5E] rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <span
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white shrink-0"
                    style={{ backgroundColor: ALT_COLORS[selectedChoice] }}
                  >
                    {selectedChoice}
                  </span>
                  <p className="text-sm text-[#8899CC] italic leading-relaxed">
                    &quot;{getAltText(selectedChoice, currentQuestion)}&quot;
                  </p>
                </div>
              </div>
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
                <motion.span
                  className="inline-block bg-[#C8A84B] text-[#050A1A] text-sm font-bold px-4 py-2 rounded-full"
                  style={{ fontFamily: 'var(--font-space-grotesk)' }}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', bounce: 0.5 }}
                >
                  Gabarito: <span className="text-lg">{correctAnswer}</span>
                </motion.span>
              </div>

              {/* All alternatives with results */}
              <div className="flex flex-col gap-2.5">
                {(['A', 'B', 'C', 'D', 'E'] as const).map((letter) => {
                  const altText = getAltText(letter, currentQuestion)
                  const isCorrect = letter === correctAnswer
                  const isStudentChoice = letter === selectedChoice
                  const isWrongChoice = isStudentChoice && !isCorrect

                  let containerClass = 'w-full rounded-xl text-base font-medium flex items-center gap-3 px-4 py-3 border-2 transition-all text-left'
                  let letterStyle: React.CSSProperties = {}
                  let letterClass = ''
                  let iconEl: React.ReactNode = null

                  if (isCorrect) {
                    containerClass += ' bg-[#C8A84B]/15 border-[#C8A84B]'
                    letterClass = 'text-white'
                    letterStyle = { backgroundColor: '#C8A84B' }
                    iconEl = (
                      <motion.span
                        className="text-[#C8A84B] text-lg font-bold"
                        initial={{ scale: 0, rotate: -90 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', bounce: 0.5, delay: 0.1 }}
                      >
                        ✓
                      </motion.span>
                    )
                  } else if (isWrongChoice) {
                    containerClass += ' bg-red-500/10 border-red-500/40'
                    letterClass = 'text-white'
                    letterStyle = { backgroundColor: '#EF4444' }
                    iconEl = (
                      <motion.span
                        className="text-red-400 text-lg font-bold"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', bounce: 0.3, delay: 0.1 }}
                      >
                        ✗
                      </motion.span>
                    )
                  } else {
                    containerClass += ' bg-[#0D1B3E] border-[#1A2A5E] opacity-40'
                    letterClass = 'text-white'
                    letterStyle = { backgroundColor: ALT_COLORS[letter] }
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
                        className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${letterClass}`}
                        style={letterStyle}
                      >
                        {letter}
                      </span>
                      <span className={`flex-1 leading-snug ${
                        isCorrect ? 'text-[#E8EDFF]' : isWrongChoice ? 'text-[#E8EDFF]' : 'text-[#8899CC]'
                      }`}>
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
                      className="text-lg font-bold text-[#C8A84B]"
                      style={{ fontFamily: 'var(--font-space-grotesk)' }}
                    >
                      ✅ Você acertou!
                    </motion.div>
                  ) : (
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.4, type: 'spring' }}
                      className="text-lg font-bold text-red-400"
                      style={{ fontFamily: 'var(--font-space-grotesk)' }}
                    >
                      ❌ Você errou
                    </motion.div>
                  )
                ) : (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.4, type: 'spring' }}
                    className="text-base text-[#8899CC]"
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
      <footer className="border-t border-[#1A2A5E] px-4 py-3 mt-auto" style={{ background: '#0A1128' }}>
        <div className="max-w-lg mx-auto flex items-center justify-between text-xs text-[#5A6A9E]">
          <div className="flex items-center gap-1.5">
            <img src="/logo.svg" alt="UEMS" className="h-4 w-4 object-contain opacity-40" />
            <span>UEMS / DIGES</span>
          </div>
          <span>
            {currentQuestion ? `Questão ${questionProgress()}` : `Sessão ${codigo}`}
          </span>
        </div>
      </footer>
    </div>
  )
}
