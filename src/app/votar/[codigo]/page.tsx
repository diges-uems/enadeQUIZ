'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { io, Socket } from 'socket.io-client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Users, Wifi, WifiOff, ArrowRight } from 'lucide-react'
import type { Session, Question } from '@/types'
import { QuestionText, getActiveAlternatives } from '@/components/QuestionText'

// ─── Types ──────────────────────────────────────────────────────────────────

type PageState = 'loading' | 'error' | 'identifying' | 'waiting' | 'voting' | 'voted' | 'revealed' | 'finished'

interface SessionStatePayload {
  participantCount: number
  totalParticipants: number
  currentQuestionId: string | null
  votingPaused: boolean
}

// ─── Alternative colors ──────────────────────────────────────────────────────

const ALT_COLORS: Record<string, string> = {
  A: '#00338C',
  B: '#C8A84B',
  C: '#2196F3',
  D: '#4CAF50',
  E: '#F44336',
}

// ─── CSS Keyframes ──────────────────────────────────────────────────────────
const ANIMATION_STYLES = `
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(1); } 50% { opacity: 1; transform: scale(1.5); } }
  @keyframes glowPulse { 0%, 100% { box-shadow: 0 0 0px rgba(200,168,75,0); } 50% { box-shadow: 0 0 25px rgba(200,168,75,0.3); } }
  @keyframes scaleIn { from { transform: scale(0); } to { transform: scale(1); } }
  @keyframes bounceIn { 0% { transform: scale(0.8); opacity: 0; } 50% { transform: scale(1.05); } 100% { transform: scale(1); opacity: 1; } }
  @keyframes slideInLeft { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes dotPulse { 0%, 100% { transform: scale(1); opacity: 0.3; } 50% { transform: scale(1.5); opacity: 1; } }
  @keyframes rotateScaleIn { from { opacity: 0; transform: scale(0) rotate(-180deg); } to { opacity: 1; transform: scale(1) rotate(0); } }
`

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
  const [totalParticipants, setTotalParticipants] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [voteTimestamp, setVoteTimestamp] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  // ── Student identification state ──────────────────────────────────────
  // When a session requires identification (requireIdentification=true),
  // the student must provide RGM + Name before they can vote. The
  // resolved studentId is persisted in sessionStorage so a page refresh
  // doesn't force re-identification mid-session.
  const [studentId, setStudentId] = useState<string | null>(null)
  const [studentName, setStudentName] = useState('')
  const [studentRgm, setStudentRgm] = useState('')
  const [isIdentifying, setIsIdentifying] = useState(false)

  const socketRef = useRef<Socket | null>(null)
  const sessionFetchedRef = useRef<Session | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  // True while a student still needs to identify (RGM+Name) before they
  // can vote. Socket-driven state transitions are suppressed while this
  // is true so the identification screen isn't interrupted.
  const identificationPendingRef = useRef(false)
  // Mirror of `studentId` state for use inside socket event handlers
  // (which close over the initial render and would otherwise see a
  // stale null value). Always read studentId from this ref in socket
  // callbacks and in handleVote.
  const studentIdRef = useRef<string | null>(null)

  // ── Wake Lock: Keep phone screen awake ───────────────────────────────────
  const requestWakeLock = useCallback(async () => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return
    try {
      const wakeLock = await navigator.wakeLock.request('screen')
      wakeLockRef.current = wakeLock
      wakeLock.addEventListener('release', () => {
        wakeLockRef.current = null
      })
    } catch (err) {
      console.warn('Wake Lock request failed:', err)
    }
  }, [])

  // Acquire wake lock when page is active and re-acquire on visibility change
  useEffect(() => {
    requestWakeLock()

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (wakeLockRef.current) {
        wakeLockRef.current.release()
        wakeLockRef.current = null
      }
    }
  }, [requestWakeLock])

  // ── Score tracking ──────────────────────────────────────────────────────
  const [correctCount, setCorrectCount] = useState(() => {
    if (typeof window === 'undefined') return 0
    try {
      const stored = sessionStorage.getItem(`score_${codigo}`)
      if (stored) return (JSON.parse(stored) as { correct: number; answered: number }).correct
    } catch { /* ignore */ }
    return 0
  })
  const [answeredCount, setAnsweredCount] = useState(() => {
    if (typeof window === 'undefined') return 0
    try {
      const stored = sessionStorage.getItem(`score_${codigo}`)
      if (stored) return (JSON.parse(stored) as { correct: number; answered: number }).answered
    } catch { /* ignore */ }
    return 0
  })

  // ── Voting timer ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!voteTimestamp) return
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - voteTimestamp) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [voteTimestamp])

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

  // ── Student identification persistence ─────────────────────────────────
  const loadStudent = useCallback((): { id: string; name: string; rgm: string } | null => {
    if (typeof window === 'undefined') return null
    const raw = sessionStorage.getItem(`student_${codigo}`)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as { id: string; name: string; rgm: string }
      if (parsed && typeof parsed.id === 'string') return parsed
    } catch { /* ignore */ }
    return null
  }, [codigo])

  const saveStudent = useCallback((id: string, name: string, rgm: string) => {
    if (typeof window === 'undefined') return
    sessionStorage.setItem(`student_${codigo}`, JSON.stringify({ id, name, rgm }))
  }, [codigo])

  const clearStudent = useCallback(() => {
    if (typeof window === 'undefined') return
    sessionStorage.removeItem(`student_${codigo}`)
  }, [codigo])

  // ── Question progress ─────────────────────────────────────────────────
  const questionProgress = useCallback((): string => {
    if (!session || !currentQuestion) return ''
    const idx = session.questions.findIndex((q) => q.id === currentQuestion.id)
    if (idx === -1) return ''
    return `${idx + 1} / ${session.questions.length}`
  }, [session, currentQuestion])

  const questionProgressPercent = useCallback((): number => {
    if (!session || !currentQuestion) return 0
    const idx = session.questions.findIndex((q) => q.id === currentQuestion.id)
    if (idx === -1) return 0
    return ((idx + 1) / session.questions.length) * 100
  }, [session, currentQuestion])

  // ── Determine state from session data (no identification needed) ────────
  const determineState = useCallback((data: Session, questionId: string | null, paused: boolean): PageState => {
    if (data.status === 'finished') return 'finished'
    if (!questionId) return 'waiting'

    const q = data.questions.find((q) => q.id === questionId)
    if (!q) return 'waiting'

    setCurrentQuestion(q)
    const stored = getStoredVote(q.id)
    if (stored) {
      setSelectedChoice(stored as 'A' | 'B' | 'C' | 'D' | 'E')
      if (q.isRevealed) {
        setCorrectAnswer(q.correctAnswer)
        return 'revealed'
      }
      return 'voted'
    }
    if (q.isRevealed) {
      setCorrectAnswer(q.correctAnswer)
      return 'revealed'
    }
    if (paused) return 'waiting'
    return 'voting'
  }, [getStoredVote])

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
        sessionFetchedRef.current = data

        // ── Identification gate ──────────────────────────────────────────
        // Sessions with requireIdentification=true require the student to
        // provide RGM + Name before voting. Test sessions skip this.
        if (data.requireIdentification) {
          const saved = loadStudent()
          if (saved) {
            // Returning student (page refresh) — reuse saved identity.
            setStudentId(saved.id)
            setStudentName(saved.name)
            setStudentRgm(saved.rgm)
            identificationPendingRef.current = false
          } else {
            // First visit — show identification screen. Socket state
            // transitions are suppressed until identification completes.
            identificationPendingRef.current = true
            setPageState('identifying')
          }
        } else {
          identificationPendingRef.current = false
        }

        // Determine state directly (only if not pending identification)
        if (!identificationPendingRef.current) {
          const state = determineState(data, data.currentQuestionId, false)
          setPageState(state)
        }

        // Connect socket (non-blocking)
        const socket = io('/?XTransformPort=3003', {
          transports: ['websocket', 'polling'],
          timeout: 10000,
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
        })
        socketRef.current = socket

        socket.on('connect', () => {
          setIsConnected(true)
          // Emit join-session with student info when available so the
          // socket service can track name/rgm for score reporting.
          const saved = loadStudent()
          socket.emit('join-session', {
            sessionCode: codigo,
            role: 'student',
            ...(saved ? { name: saved.name, rgm: saved.rgm } : {}),
          })
        })

        socket.on('session-state', (state: SessionStatePayload) => {
          setParticipantCount(state.participantCount)
          setTotalParticipants(state.totalParticipants)
          setVotingPaused(state.votingPaused)

          // Don't transition out of the identification screen — the
          // student must finish identifying before they can vote.
          if (identificationPendingRef.current) {
            // Exception: if the session finished while the student was
            // identifying, move them to the finished screen.
            if (sessionFetchedRef.current?.status === 'finished') {
              setPageState('finished')
            }
            return
          }

          const newState = determineState(sessionFetchedRef.current!, state.currentQuestionId, state.votingPaused)
          setPageState(newState)
        })

        socket.on('question-activated', (data: { questionId: string; votingPaused: boolean }) => {
          // Suppress while identifying — the student can't vote yet.
          if (identificationPendingRef.current) return
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
                  setPageState(data.votingPaused ? 'waiting' : 'voting')
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
          setVoteTimestamp(Date.now())
          toast.success('Voto registrado com sucesso!')

          // Persist to DB via API — include studentId when available so
          // the vote is linked to the identified student for scoring.
          try {
            const sid = studentIdRef.current
            await fetch('/api/vote', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionCode: codigo,
                questionId: data.questionId,
                choice: data.choice,
                ...(sid ? { studentId: sid } : {}),
              }),
            })
          } catch (err) {
            console.error('Failed to persist vote to DB:', err)
          }
        })

        socket.on('vote-rejected', (data: { reason: string }) => {
          setIsSubmitting(false)
          toast.error(data.reason || 'Voto rejeitado')
        })

        socket.on('answer-revealed', (data: { questionId: string; correctAnswer: string }) => {
          setCorrectAnswer(data.correctAnswer)
          setPageState('revealed')
          setVoteTimestamp(null)
          setElapsedSeconds(0)

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
          if (identificationPendingRef.current) return
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
          identificationPendingRef.current = false
          setPageState('finished')
        })

        socket.on('session-reset', () => {
          // Clear all stored votes from sessionStorage
          if (typeof window !== 'undefined' && sessionFetchedRef.current) {
            for (const q of sessionFetchedRef.current.questions) {
              sessionStorage.removeItem(`voted_${q.id}`)
            }
            sessionStorage.removeItem(`score_${codigo}`)
          }
          // Reset all state
          setSelectedChoice(null)
          setCorrectAnswer(null)
          setVotingPaused(false)
          setCorrectCount(0)
          setAnsweredCount(0)
          setCurrentQuestion(null)
          setVoteTimestamp(null)
          setElapsedSeconds(0)
          // Keep the student identity (RGM/name) — only reset votes.
          setPageState('waiting')
          toast.info('Sessão reiniciada pelo apresentador')
        })

        socket.on('participant-count', (data: { live: number; total: number }) => {
          setParticipantCount(data.live)
          setTotalParticipants(data.total)
        })

        socket.on('connect_error', () => {
          setIsConnected(false)
        })

        socket.on('disconnect', () => {
          setIsConnected(false)
        })

        socket.on('reconnect_attempt', () => {
          setIsConnected(false)
        })

        socket.on('reconnect_error', () => {
          setIsConnected(false)
        })

        socket.on('reconnect', () => {
          setIsConnected(true)
          // Re-join session on reconnect so participant count stays accurate.
          // The `connect` handler above also re-joins (and fires on every
          // successful reconnection) — this is kept for safety.
          socket.emit('join-session', { sessionCode: codigo, role: 'student' })
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
  }, [codigo])

  // ── Screen Wake Lock: keep phone screen on ──────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return

    const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ released: boolean; release(): Promise<void>; addEventListener(type: string, listener: () => void): void }> } }
    if (!nav.wakeLock) return

    let wakeLock: { released: boolean; release(): Promise<void>; addEventListener(type: string, listener: () => void): void } | null = null

    const requestWakeLock = async () => {
      try {
        wakeLock = await nav.wakeLock!.request('screen')

        const handleVisibility = async () => {
          if (document.visibilityState === 'visible' && (!wakeLock || wakeLock.released)) {
            try {
              wakeLock = await nav.wakeLock!.request('screen')
            } catch { /* ignore */ }
          }
        }
        document.addEventListener('visibilitychange', handleVisibility)

        wakeLock.addEventListener('release', () => {
          wakeLock = null
        })
      } catch { /* Wake Lock not available */ }
    }

    requestWakeLock()

    return () => {
      if (wakeLock) {
        wakeLock.release()
        wakeLock = null
      }
    }
  }, [])

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

      const sid = studentIdRef.current

      // Try socket first, fallback to API
      if (socketRef.current.connected) {
        socketRef.current.emit('submit-vote', {
          sessionCode: codigo,
          questionId: currentQuestion.id,
          choice,
          ...(sid ? { studentId: sid } : {}),
        })
      } else {
        // Fallback: submit via API
        fetch('/api/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionCode: codigo,
            questionId: currentQuestion.id,
            choice,
            ...(sid ? { studentId: sid } : {}),
          }),
        })
          .then(async (res) => {
            if (res.ok) {
              const data = await res.json()
              setSelectedChoice(choice)
              storeVote(currentQuestion.id, choice)
              setPageState('voted')
              setVoteTimestamp(Date.now())
              toast.success('Voto registrado!')
              if (data.results) {
                // Optionally handle results
              }
            } else {
              toast.error('Erro ao registrar voto')
            }
          })
          .catch(() => {
            toast.error('Erro de conexão')
          })
          .finally(() => {
            setIsSubmitting(false)
          })
      }
    },
    [codigo, currentQuestion, getStoredVote, isSubmitting, storeVote]
  )

  // ── Submit identification (RGM + Name) ──────────────────────────────────
  // Called when a session requires identification and the student hasn't
  // identified yet. Registers/retrieves the student via the API, persists
  // the identity to sessionStorage, then transitions into the normal
  // voting flow.
  const handleIdentification = useCallback(async () => {
    const name = studentName.trim()
    const rgm = studentRgm.trim()
    if (!name) {
      toast.error('Informe seu nome completo.')
      return
    }
    if (!rgm) {
      toast.error('Informe seu RGM.')
      return
    }
    setIsIdentifying(true)
    try {
      const res = await fetch('/api/student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionCode: codigo, name, rgm }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Falha ao identificar')
      }
      const payload = (await res.json()) as {
        student: { id: string; name: string; rgm: string }
        isNew: boolean
      }
      const student = payload.student
      // Persist identity so a refresh doesn't force re-identification.
      saveStudent(student.id, student.name, student.rgm)
      setStudentId(student.id)
      setStudentName(student.name)
      setStudentRgm(student.rgm)
      studentIdRef.current = student.id
      identificationPendingRef.current = false

      // Re-emit join-session with the now-known identity so the socket
      // service can attribute votes/scores to this student by name.
      if (socketRef.current?.connected) {
        socketRef.current.emit('join-session', {
          sessionCode: codigo,
          role: 'student',
          name: student.name,
          rgm: student.rgm,
        })
      }

      // Transition into the normal flow based on current session state.
      if (sessionFetchedRef.current) {
        const state = determineState(
          sessionFetchedRef.current,
          sessionFetchedRef.current.currentQuestionId,
          false
        )
        setPageState(state)
      } else {
        setPageState('waiting')
      }

      if (payload.isNew) {
        toast.success(`Bem-vindo, ${student.name.split(' ')[0]}!`)
      } else {
        toast.info(`Bem-vindo de volta, ${student.name.split(' ')[0]}!`)
      }
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'Erro ao identificar.')
    } finally {
      setIsIdentifying(false)
    }
  }, [codigo, studentName, studentRgm, saveStudent, determineState])

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
        <style dangerouslySetInnerHTML={{ __html: ANIMATION_STYLES }} />
        <div
          className="w-12 h-12 border-4 border-[#C8A84B] border-t-transparent rounded-full mb-4"
          style={{ animation: 'spin 1s linear infinite' }}
        />
        <p className="text-[#8899CC] text-base" style={{ animation: 'fadeIn 0.5s ease-out' }}>
          Carregando sessão...
        </p>
      </div>
    )
  }

  // Error state
  if (pageState === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: '#050A1A' }}>
        <style dangerouslySetInnerHTML={{ __html: ANIMATION_STYLES }} />
        <div className="text-center space-y-4" style={{ animation: 'fadeInUp 0.5s ease-out' }}>
          <div className="text-5xl mb-2">😕</div>
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
        </div>
      </div>
    )
  }

  // Finished state
  if (pageState === 'finished') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: '#050A1A' }}>
        <style dangerouslySetInnerHTML={{ __html: ANIMATION_STYLES }} />
        <div className="max-w-sm w-full text-center" style={{ animation: 'fadeInUp 0.7s ease-out' }}>
          {/* Trophy */}
          <div className="mb-4" style={{ animation: 'rotateScaleIn 0.8s ease-out' }}>
            <span className="text-7xl">🏆</span>
          </div>

          <h1
            className="text-3xl font-bold mb-2"
            style={{ fontFamily: 'var(--font-space-grotesk)', color: '#C8A84B' }}
          >
            Sessão Encerrada
          </h1>

          <p className="text-[#8899CC] text-base mb-2">
            Obrigado por participar!
          </p>

          {answeredCount > 0 && (
            <div className="mb-6" style={{ animation: 'bounceIn 0.4s ease-out 0.6s both' }}>
              <span
                className="inline-block px-4 py-1.5 bg-[#0D1B3E] border border-[#1A2A5E] rounded-full text-[#C8A84B] font-bold text-lg"
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                {correctCount}/{answeredCount} acertos
              </span>
            </div>
          )}

          <div style={{ animation: 'fadeIn 0.4s ease-out 0.7s both' }}>
            <Button
              onClick={() => router.push('/')}
              className="bg-[#C8A84B] hover:bg-[#B8983B] text-[#050A1A] font-semibold px-6"
            >
              Voltar ao início
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Identification state — student must provide RGM + Name before voting.
  // Only shown for sessions where requireIdentification=true.
  if (pageState === 'identifying') {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: '#050A1A' }}>
        <style dangerouslySetInnerHTML={{ __html: ANIMATION_STYLES }} />

        {/* Header */}
        <header className="flex items-center justify-between px-4 py-2.5 border-b border-[#1A2A5E] shrink-0" style={{ background: '#0A1128' }}>
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="UEMS" className="h-7 w-7 object-contain" />
            <span
              className="text-[#E8EDFF] text-sm font-semibold"
              style={{ fontFamily: 'var(--font-space-grotesk)' }}
            >
              ENADE Quiz
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Connection status */}
            <div className="relative" style={!isConnected ? { animation: 'pulse 1.5s ease-in-out infinite' } : {}}>
              {isConnected ? (
                <Wifi className="w-4 h-4 text-green-400" />
              ) : (
                <WifiOff className="w-4 h-4 text-red-400" />
              )}
            </div>
          </div>
        </header>

        {/* Identification form */}
        <main className="flex-1 flex flex-col items-center justify-center px-4 py-8">
          <div className="w-full max-w-md" style={{ animation: 'fadeInUp 0.5s ease-out' }}>
            {/* Icon */}
            <div className="text-center mb-6">
              <div
                className="w-16 h-16 mx-auto rounded-full bg-[#C8A84B]/15 border-2 border-[#C8A84B] flex items-center justify-center mb-4"
                style={{ animation: 'glowPulse 2.5s ease-in-out infinite' }}
              >
                <span className="text-3xl">🎓</span>
              </div>
              <h1
                className="text-2xl font-bold text-[#E8EDFF] mb-1"
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                Identificação
              </h1>
              <p className="text-sm text-[#8899CC]">
                {session?.title || `Sessão ${codigo}`}
              </p>
              <p className="text-xs text-[#5A6A9E] mt-2">
                Informe seus dados para participar da votação
              </p>
            </div>

            {/* Form card */}
            <div className="bg-[#0D1B3E] border border-[#1A2A5E] rounded-2xl p-6 shadow-xl shadow-[#00338C]/10">
              <div className="flex flex-col gap-4">
                {/* RGM */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="student-rgm" className="text-sm font-medium text-[#8892B0]">
                    RGM <span className="text-[#C8A84B]">*</span>
                  </label>
                  <input
                    id="student-rgm"
                    type="text"
                    inputMode="numeric"
                    placeholder="Seu RGM"
                    value={studentRgm}
                    onChange={(e) => setStudentRgm(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        // Move focus to name field, or submit if name already filled
                        if (studentName.trim()) handleIdentification()
                        else document.getElementById('student-name')?.focus()
                      }
                    }}
                    autoComplete="off"
                    className="h-12 px-4 rounded-xl bg-[#050A1A] border border-[#1A2A5E] text-[#E8EDFF] placeholder:text-[#3A4A7E] text-base focus:border-[#C8A84B] focus:ring-[#C8A84B]/30 focus:ring-[3px] focus:outline-none transition-all"
                  />
                </div>

                {/* Name */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="student-name" className="text-sm font-medium text-[#8892B0]">
                    Nome completo <span className="text-[#C8A84B]">*</span>
                  </label>
                  <input
                    id="student-name"
                    type="text"
                    placeholder="Seu nome completo"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleIdentification()
                    }}
                    autoComplete="off"
                    className="h-12 px-4 rounded-xl bg-[#050A1A] border border-[#1A2A5E] text-[#E8EDFF] placeholder:text-[#3A4A7E] text-base focus:border-[#C8A84B] focus:ring-[#C8A84B]/30 focus:ring-[3px] focus:outline-none transition-all"
                  />
                </div>

                {/* Submit */}
                <Button
                  onClick={handleIdentification}
                  disabled={isIdentifying}
                  className="h-12 mt-1 text-base font-semibold bg-[#00338C] hover:bg-[#0044B8] text-white rounded-xl transition-all duration-200 shadow-lg shadow-[#00338C]/30 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isIdentifying ? (
                    <>
                      <div
                        className="w-5 h-5 border-2 border-white border-t-transparent rounded-full mr-2"
                        style={{ animation: 'spin 0.8s linear infinite' }}
                      />
                      Identificando...
                    </>
                  ) : (
                    <>
                      Entrar na sessão
                      <ArrowRight className="w-5 h-5 ml-1" />
                    </>
                  )}
                </Button>
              </div>

              <p className="text-[#3A4A7E] text-xs text-center mt-4">
                Seus dados serão vinculados aos seus votos para contabilizar a pontuação.
              </p>
            </div>

            {/* Live participant count */}
            {participantCount > 0 && (
              <div className="flex items-center justify-center gap-2 mt-4 text-xs text-[#5A6A9E]" style={{ animation: 'fadeIn 0.4s ease-out 0.5s both' }}>
                <Users className="w-3.5 h-3.5" />
                <span>{participantCount} {participantCount === 1 ? 'participante conectado' : 'participantes conectados'}</span>
              </div>
            )}
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-[#1A2A5E] px-4 py-3 mt-auto" style={{ background: '#0A1128' }}>
          <div className="max-w-md mx-auto flex items-center justify-between text-xs text-[#5A6A9E]">
            <div className="flex items-center gap-1.5">
              <img src="/logo.png" alt="UEMS" className="h-4 w-4 object-contain opacity-40" />
              <span>UEMS / DIGES</span>
            </div>
            <span>Sessão {codigo}</span>
          </div>
        </footer>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#050A1A' }}>
      <style dangerouslySetInnerHTML={{ __html: ANIMATION_STYLES }} />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-[#1A2A5E] shrink-0" style={{ background: '#0A1128' }}>
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="UEMS" className="h-7 w-7 object-contain" />
          <span
            className="text-[#E8EDFF] text-sm font-semibold"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            ENADE Quiz
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Score badge */}
          {answeredCount > 0 && (
            <span
              className="px-2.5 py-0.5 bg-[#C8A84B]/15 border border-[#C8A84B]/40 rounded-full text-[#C8A84B] text-xs font-bold"
              style={{ fontFamily: 'var(--font-space-grotesk)', animation: 'bounceIn 0.3s ease-out' }}
            >
              {correctCount} acerto{correctCount !== 1 ? 's' : ''}
            </span>
          )}

          {/* Student name badge (identified sessions only) */}
          {studentName && (
            <button
              onClick={() => {
                clearStudent()
                setStudentId(null)
                setStudentName('')
                setStudentRgm('')
                studentIdRef.current = null
                identificationPendingRef.current = true
                setPageState('identifying')
              }}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 bg-[#0D1B3E] border border-[#1A2A5E] rounded-full text-[#E8EDFF] text-xs font-medium hover:border-[#C8A84B]/50 transition-colors"
              title="Clique para trocar de aluno"
            >
              <span className="max-w-[120px] truncate">{studentName}</span>
              <span className="text-[#5A6A9E] text-[10px]">⏻</span>
            </button>
          )}

          {/* Participant count */}
          {participantCount > 0 && (
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

          {/* Screen wake lock indicator */}
          {'wakeLock' in navigator && (
            <div className="flex items-center gap-0.5" title="Tela mantida acesa">
              <div className="w-2 h-2 rounded-full bg-green-400" style={{ animation: 'pulse 2s ease-in-out infinite' }} />
            </div>
          )}

          {/* Connection status */}
          <div className="relative" style={!isConnected ? { animation: 'pulse 1.5s ease-in-out infinite' } : {}}>
            {isConnected ? (
              <Wifi className="w-4 h-4 text-green-400" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-400" />
            )}
          </div>
        </div>
      </header>

      {/* ── Question progress bar ───────────────────────────────────────── */}
      {(pageState === 'voting' || pageState === 'voted' || pageState === 'revealed') && session && currentQuestion && (
        <div className="h-1 bg-[#0D1B3E] shrink-0">
          <div
            className="h-full bg-[#C8A84B] transition-all duration-500 ease-out"
            style={{ width: `${questionProgressPercent()}%` }}
          />
        </div>
      )}

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col p-4 max-w-lg mx-auto w-full">

        {/* ── State: Waiting ───────────────────────────────────────────── */}
        {pageState === 'waiting' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center" style={{ animation: 'fadeInUp 0.3s ease-out' }}>
            {/* Pulsing dots */}
            <div className="flex items-center justify-center gap-2 mb-6">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-3 h-3 rounded-full bg-[#C8A84B]"
                  style={{
                    animation: `dotPulse 1.2s ease-in-out ${i * 0.4}s infinite`,
                  }}
                />
              ))}
            </div>

            <h2
              className="text-lg font-semibold text-[#E8EDFF] mb-2"
              style={{ fontFamily: 'var(--font-space-grotesk)' }}
            >
              Aguardando a próxima questão...
            </h2>
            <p className="text-sm text-[#8899CC]">
              O apresentador iniciará a questão em breve.
            </p>
            {session && (
              <p className="text-xs text-[#5A6A9E] mt-2">{session.title}</p>
            )}
            {votingPaused && currentQuestion && (
              <div className="mt-4 px-4 py-2 bg-[#C8A84B]/10 border border-[#C8A84B]/30 rounded-lg">
                <p className="text-[#C8A84B] text-sm font-medium">
                  ⏸ Votação pausada
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── State: Voting ────────────────────────────────────────────── */}
        {pageState === 'voting' && currentQuestion && (
          <div className="flex-1 flex flex-col" style={{ animation: 'fadeInUp 0.3s ease-out' }}>
            {/* Question header */}
            <div className="mb-4 pb-3 border-b border-[#1A2A5E]">
              <div className="inline-block bg-[#00338C] text-white text-xs font-bold px-3 py-1 rounded-full mb-3">
                ENADE {currentQuestion.year} · Q{(session?.questions.findIndex((q) => q.id === currentQuestion.id) ?? -1) + 1}
              </div>
              <QuestionText text={currentQuestion.text} textSize="base" className="text-[#E8EDFF]" imageUrl={currentQuestion.imageUrl} />
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
              {getActiveAlternatives(currentQuestion).map((letter, idx) => {
                const altText = getAltText(letter, currentQuestion)
                const color = ALT_COLORS[letter]
                return (
                  <button
                    key={letter}
                    onClick={() => handleVote(letter as 'A' | 'B' | 'C' | 'D' | 'E')}
                    disabled={isSubmitting}
                    className="w-full min-h-14 rounded-xl text-base font-medium flex items-center gap-3 px-4 py-3 border-2 transition-all duration-150 bg-[#0D1B3E] border-[#1A2A5E] hover:border-[#C8A84B] hover:shadow-[0_0_15px_rgba(200,168,75,0.15)] active:bg-[#1A2A5E] active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed text-left"
                    style={{ animation: `slideInLeft 0.3s ease-out ${idx * 0.06}s both` }}
                  >
                    <span
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold text-white shrink-0"
                      style={{ backgroundColor: color }}
                    >
                      {letter}
                    </span>
                    <span className="flex-1 leading-snug text-[#E8EDFF] text-justify">{altText}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── State: Already voted ─────────────────────────────────────── */}
        {pageState === 'voted' && currentQuestion && selectedChoice && (
          <div className="flex-1 flex flex-col items-center justify-center text-center" style={{ animation: 'fadeInUp 0.3s ease-out' }}>
            {/* Gold checkmark */}
            <div className="mb-6" style={{ animation: 'scaleIn 0.4s ease-out' }}>
              <div
                className="w-20 h-20 rounded-full bg-[#C8A84B]/15 border-2 border-[#C8A84B] flex items-center justify-center"
                style={{ animation: 'glowPulse 2s ease-in-out infinite' }}
              >
                <span className="text-[#C8A84B] text-3xl font-bold">✓</span>
              </div>
            </div>

            <h2
              className="text-lg font-semibold text-[#E8EDFF] mb-2"
              style={{ fontFamily: 'var(--font-space-grotesk)' }}
            >
              Você votou na alternativa{' '}
              <span className="font-bold text-[#C8A84B]">
                {selectedChoice}
              </span>
            </h2>

            {/* Timer indicator */}
            <div className="flex items-center justify-center gap-2 mb-4">
              <div
                className="w-2 h-2 rounded-full bg-[#C8A84B]"
                style={{ animation: 'pulse 1.5s ease-in-out infinite' }}
              />
              <p className="text-sm text-[#8899CC]">
                Aguardando o gabarito...
              </p>
              {elapsedSeconds > 0 && (
                <span className="text-xs text-[#5A6A9E] tabular-nums">
                  {elapsedSeconds}s
                </span>
              )}
            </div>

            {/* Selected answer card */}
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
          </div>
        )}

        {/* ── State: Answer revealed ───────────────────────────────────── */}
        {pageState === 'revealed' && currentQuestion && correctAnswer && (
          <div className="flex-1 flex flex-col" style={{ animation: 'fadeInUp 0.3s ease-out' }}>
            {/* Correct answer header */}
            <div className="text-center mb-5">
              <span
                className="inline-block bg-[#C8A84B] text-[#050A1A] text-sm font-bold px-4 py-2 rounded-full"
                style={{ fontFamily: 'var(--font-space-grotesk)', animation: 'bounceIn 0.4s ease-out' }}
              >
                Gabarito: <span className="text-lg">{correctAnswer}</span>
              </span>
            </div>

            {/* All alternatives with results */}
            <div className="flex flex-col gap-2.5">
              {getActiveAlternatives(currentQuestion).map((letter, idx) => {
                const altText = getAltText(letter, currentQuestion)
                const isCorrect = letter === correctAnswer
                const isStudentChoice = letter === selectedChoice
                const isWrongChoice = isStudentChoice && !isCorrect

                let containerClass = 'w-full rounded-xl text-base font-medium flex items-center gap-3 px-4 py-3 border-2 text-left'
                let letterStyle: React.CSSProperties = {}
                let iconEl: React.ReactNode = null

                if (isCorrect) {
                  containerClass += ' bg-[#C8A84B]/15 border-[#C8A84B]'
                  letterStyle = { backgroundColor: '#C8A84B' }
                  iconEl = (
                    <span className="text-[#C8A84B] text-lg font-bold" style={{ animation: 'scaleIn 0.3s ease-out 0.1s both' }}>
                      ✓
                    </span>
                  )
                } else if (isWrongChoice) {
                  containerClass += ' bg-red-500/10 border-red-500/40'
                  letterStyle = { backgroundColor: '#EF4444' }
                  iconEl = (
                    <span className="text-red-400 text-lg font-bold" style={{ animation: 'scaleIn 0.3s ease-out 0.1s both' }}>
                      ✗
                    </span>
                  )
                } else {
                  containerClass += ' bg-[#0D1B3E] border-[#1A2A5E] opacity-40'
                  letterStyle = { backgroundColor: ALT_COLORS[letter] }
                }

                return (
                  <div
                    key={letter}
                    className={containerClass}
                    style={{ animation: `slideInLeft 0.3s ease-out ${idx * 0.05}s both` }}
                  >
                    <span
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold text-white shrink-0"
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
                  </div>
                )
              })}
            </div>

            {/* Result summary */}
            <div className="mt-6 text-center">
              {selectedChoice ? (
                selectedChoice === correctAnswer ? (
                  <div
                    className="text-lg font-bold text-[#C8A84B]"
                    style={{ fontFamily: 'var(--font-space-grotesk)', animation: 'bounceIn 0.4s ease-out 0.4s both' }}
                  >
                    ✅ Você acertou!
                  </div>
                ) : (
                  <div
                    className="text-lg font-bold text-red-400"
                    style={{ fontFamily: 'var(--font-space-grotesk)', animation: 'bounceIn 0.4s ease-out 0.4s both' }}
                  >
                    ❌ Você errou
                  </div>
                )
              ) : (
                <div
                  className="text-base text-[#8899CC]"
                  style={{ animation: 'fadeIn 0.3s ease-out 0.4s both' }}
                >
                  Você não votou nesta questão.
                </div>
              )}
            </div>

            {/* Score Summary */}
            {answeredCount > 0 && (
              <div
                className="mt-4 p-3 bg-[#0D1B3E] border border-[#1A2A5E] rounded-xl"
                style={{ animation: 'fadeInUp 0.4s ease-out 0.6s both' }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#8899CC]">Sua pontuação</span>
                  <span
                    className="text-lg font-bold text-[#C8A84B]"
                    style={{ fontFamily: 'var(--font-space-grotesk)' }}
                  >
                    {correctCount}/{answeredCount}
                  </span>
                </div>
                <div className="mt-2 h-2 bg-[#1A2A5E] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#C8A84B] rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${answeredCount > 0 ? (correctCount / answeredCount) * 100 : 0}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-[#5A6A9E]">{Math.round(answeredCount > 0 ? (correctCount / answeredCount) * 100 : 0)}% de acerto</span>
                  <span className="text-xs text-[#5A6A9E]">{answeredCount === 1 ? '1 questão' : `${answeredCount} questões`}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-[#1A2A5E] px-4 py-3 mt-auto" style={{ background: '#0A1128' }}>
        <div className="max-w-lg mx-auto flex items-center justify-between text-xs text-[#5A6A9E]">
          <div className="flex items-center gap-1.5">
            <img src="/logo.png" alt="UEMS" className="h-4 w-4 object-contain opacity-40" />
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
