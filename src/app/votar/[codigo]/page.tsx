'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { io, Socket } from 'socket.io-client'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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

  // ── Student identification state ────────────────────────────────────────
  const [studentName, setStudentName] = useState('')
  const [studentRgm, setStudentRgm] = useState('')
  const [studentId, setStudentId] = useState<string | null>(null)
  const [isRegistering, setIsRegistering] = useState(false)
  const [nameError, setNameError] = useState('')
  const [rgmError, setRgmError] = useState('')

  const socketRef = useRef<Socket | null>(null)
  const sessionFetchedRef = useRef<Session | null>(null)

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

  // ── Question progress (e.g., "3 / 10") ─────────────────────────────────
  const questionProgress = useCallback((): string => {
    if (!session || !currentQuestion) return ''
    const idx = session.questions.findIndex((q) => q.id === currentQuestion.id)
    if (idx === -1) return ''
    return `${idx + 1} / ${session.questions.length}`
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
          Obrigado por participar, {studentName || 'estudante'}! A sessão foi finalizada pelo apresentador.
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
              {/* UEMS branding */}
              <div className="w-full max-w-sm">
                <div className="text-center mb-8">
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1, type: 'spring' }}
                    className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-[#00338C] mb-4"
                  >
                    <span className="text-3xl font-bold text-white">E</span>
                  </motion.div>
                  <h1 className="text-2xl font-bold text-[#00338C] mb-1">
                    ENADE Quiz
                  </h1>
                  <p className="text-gray-500 text-sm">
                    Identifique-se para participar da sessão
                  </p>
                </div>

                <Card className="border-0 shadow-lg">
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      {/* Name field */}
                      <div>
                        <label
                          htmlFor="student-name"
                          className="block text-sm font-medium text-gray-700 mb-1.5"
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
                          className={`h-12 text-base ${nameError ? 'border-red-400 focus-visible:ring-red-400' : 'border-gray-300 focus-visible:ring-[#00338C]'}`}
                          disabled={isRegistering}
                          autoComplete="name"
                        />
                        {nameError && (
                          <p className="text-red-500 text-xs mt-1">{nameError}</p>
                        )}
                      </div>

                      {/* RGM field */}
                      <div>
                        <label
                          htmlFor="student-rgm"
                          className="block text-sm font-medium text-gray-700 mb-1.5"
                        >
                          RGM
                          <span className="text-gray-400 font-normal ml-1">
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
                          className={`h-12 text-base ${rgmError ? 'border-red-400 focus-visible:ring-red-400' : 'border-gray-300 focus-visible:ring-[#00338C]'}`}
                          disabled={isRegistering}
                          autoComplete="off"
                        />
                        {rgmError && (
                          <p className="text-red-500 text-xs mt-1">{rgmError}</p>
                        )}
                      </div>

                      {/* Submit button */}
                      <Button
                        onClick={handleRegister}
                        disabled={isRegistering}
                        className="w-full h-12 text-base font-semibold bg-[#00338C] hover:bg-[#002468] text-white mt-2"
                      >
                        {isRegistering ? (
                          <span className="flex items-center gap-2">
                            <motion.span
                              animate={{ rotate: 360 }}
                              transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
                              className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                            />
                            Registrando...
                          </span>
                        ) : (
                          'Participar'
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <p className="text-center text-xs text-gray-400 mt-4">
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
                  className="font-bold"
                  style={{ color: ALT_COLORS[selectedChoice] }}
                >
                  {selectedChoice}
                </span>
                {studentName && (
                  <span className="text-gray-500 font-normal">, {studentName}</span>
                )}
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
