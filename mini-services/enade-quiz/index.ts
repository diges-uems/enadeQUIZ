import { createServer } from 'http'
import { Server } from 'socket.io'

const httpServer = createServer()
const io = new Server(httpServer, {
  path: '/',
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6, // 1MB
  connectTimeout: 10000,
})

// In-memory state for real-time features
// Map of sessionCode -> Set of socket IDs (participants)
const sessionParticipants = new Map<string, Set<string>>()
// Map of sessionCode -> total unique participants ever connected (only increments, never decrements)
const sessionTotalParticipants = new Map<string, number>()
// Map of sessionCode -> current question ID
const sessionCurrentQuestion = new Map<string, string | null>()
// Map of sessionCode -> voting paused state
const sessionVotingPaused = new Map<string, boolean>()
// Map of `${sessionCode}:${questionId}` -> vote counts
const sessionVoteCounts = new Map<string, { A: number; B: number; C: number; D: number; E: number; total: number }>()

// ── Student tracking ────────────────────────────────────────────────────────
// Map of socket ID -> student info
const studentBySocket = new Map<string, { name: string; rgm: string; sessionCode: string }>()

// ── Score tracking ──────────────────────────────────────────────────────────
// Map of sessionCode -> Map of studentId (rgm) -> score info
interface StudentScore {
  name: string
  rgm: string
  score: number
  answers: number
  corrects: number
}
const sessionScores = new Map<string, Map<string, StudentScore>>()

// ── Track which question each socket has already voted on (anti-double-vote) ─
const socketVotedQuestions = new Map<string, Set<string>>()

// ── Reverse map: socket ID -> session code (for O(1) disconnect lookup) ─────
const socketSession = new Map<string, string>()

// ── Grace period for disconnects (prevents count fluctuation) ───────────────
// When a socket disconnects, we wait GRACE_PERIOD_MS before actually removing
// them from the participant count. If they reconnect within that window, no
// count change happens. This prevents the participant number from bouncing
// when phones briefly lose connection.
const GRACE_PERIOD_MS = 30_000 // 30 seconds
const pendingRemovals = new Map<string, { sessionCode: string; timer: ReturnType<typeof setTimeout> }>()

// ── Vote batching: accumulate votes and broadcast at intervals ──────────────
const pendingVoteBroadcasts = new Set<string>() // session codes that need vote broadcast
const VOTE_BATCH_INTERVAL = 150 // ms — broadcast vote results at most every 150ms

setInterval(() => {
  for (const sessionCode of pendingVoteBroadcasts) {
    const questionId = sessionCurrentQuestion.get(sessionCode)
    if (questionId) {
      const key = getVoteKey(sessionCode, questionId)
      const results = sessionVoteCounts.get(key)
      if (results) {
        io.to(`session:${sessionCode}`).emit('vote-results', { ...results })
      }
    }
  }
  pendingVoteBroadcasts.clear()
}, VOTE_BATCH_INTERVAL)

// ── Participant count batching ──────────────────────────────────────────────
const pendingParticipantBroadcasts = new Set<string>() // session codes that need participant count broadcast
const PARTICIPANT_BATCH_INTERVAL = 200 // ms

setInterval(() => {
  for (const sessionCode of pendingParticipantBroadcasts) {
    const count = sessionParticipants.get(sessionCode)?.size || 0
    const total = sessionTotalParticipants.get(sessionCode) || 0
    io.to(`session:${sessionCode}`).emit('participant-count', { live: count, total })
  }
  pendingParticipantBroadcasts.clear()
}, PARTICIPANT_BATCH_INTERVAL)

function getVoteKey(sessionCode: string, questionId: string) {
  return `${sessionCode}:${questionId}`
}

function initVoteCounts(sessionCode: string, questionId: string) {
  const key = getVoteKey(sessionCode, questionId)
  if (!sessionVoteCounts.has(key)) {
    sessionVoteCounts.set(key, { A: 0, B: 0, C: 0, D: 0, E: 0, total: 0 })
  }
  return sessionVoteCounts.get(key)!
}

function getRanking(sessionCode: string): StudentScore[] {
  const scoreMap = sessionScores.get(sessionCode)
  if (!scoreMap) return []
  return Array.from(scoreMap.values()).sort((a, b) => b.score - a.score)
}

io.on('connection', (socket) => {
  // Cancel any pending removal for this socket (reconnection within grace period)
  const pendingRemoval = pendingRemovals.get(socket.id)
  if (pendingRemoval) {
    clearTimeout(pendingRemoval.timer)
    pendingRemovals.delete(socket.id)
    // Socket is already in the participant set, no count change needed
  }

  // Join a session room
  socket.on('join-session', (data: { sessionCode: string; role: 'presenter' | 'student'; name?: string; rgm?: string }) => {
    const { sessionCode, role, name, rgm } = data
    socket.join(`session:${sessionCode}`)

    // Store reverse mapping for O(1) disconnect lookup
    socketSession.set(socket.id, sessionCode)

    if (!sessionParticipants.has(sessionCode)) {
      sessionParticipants.set(sessionCode, new Set())
    }

    if (role === 'student') {
      const isNewStudent = !sessionParticipants.get(sessionCode)?.has(socket.id)
      sessionParticipants.get(sessionCode)!.add(socket.id)

      // Track total unique participants (only increments)
      if (isNewStudent) {
        const currentTotal = sessionTotalParticipants.get(sessionCode) || 0
        sessionTotalParticipants.set(sessionCode, currentTotal + 1)
      }

      // If name and rgm provided, associate with socket
      if (name && rgm) {
        studentBySocket.set(socket.id, { name, rgm, sessionCode })
      }
    }

    // Send current state to the newly joined client
    const participantCount = sessionParticipants.get(sessionCode)?.size || 0
    const totalParticipants = sessionTotalParticipants.get(sessionCode) || 0
    socket.emit('session-state', {
      participantCount,
      totalParticipants,
      currentQuestionId: sessionCurrentQuestion.get(sessionCode) || null,
      votingPaused: sessionVotingPaused.get(sessionCode) || false,
    })

    // Queue participant count broadcast (batched)
    pendingParticipantBroadcasts.add(sessionCode)
  })

  // Register student info
  socket.on('register-student', (data: { sessionCode: string; name: string; rgm: string }) => {
    const { sessionCode, name, rgm } = data
    studentBySocket.set(socket.id, { name, rgm, sessionCode })

    // Initialize score tracking if not exists
    if (!sessionScores.has(sessionCode)) {
      sessionScores.set(sessionCode, new Map())
    }
    const scoreMap = sessionScores.get(sessionCode)!
    if (!scoreMap.has(rgm)) {
      scoreMap.set(rgm, { name, rgm, score: 0, answers: 0, corrects: 0 })
    }

    socket.emit('student-registered', { success: true })
  })

  // Leave a session
  socket.on('leave-session', (data: { sessionCode: string }) => {
    const { sessionCode } = data
    socket.leave(`session:${sessionCode}`)

    const participants = sessionParticipants.get(sessionCode)
    if (participants) {
      participants.delete(socket.id)
      pendingParticipantBroadcasts.add(sessionCode)
    }
    socketSession.delete(socket.id)
  })

  // Presenter activates a question
  socket.on('activate-question', (data: { sessionCode: string; questionId: string }) => {
    const { sessionCode, questionId } = data
    sessionCurrentQuestion.set(sessionCode, questionId)
    sessionVotingPaused.set(sessionCode, false)

    // Initialize vote counts for this question
    initVoteCounts(sessionCode, questionId)

    // Notify all clients in the session (immediate — this is rare)
    io.to(`session:${sessionCode}`).emit('question-activated', {
      questionId,
      votingPaused: false,
    })

    // Send current results (likely zero) — immediate
    const key = getVoteKey(sessionCode, questionId)
    const results = sessionVoteCounts.get(key)
    io.to(`session:${sessionCode}`).emit('vote-results', results)
  })

  // Student submits a vote
  socket.on('submit-vote', (data: { sessionCode: string; questionId: string; choice: 'A' | 'B' | 'C' | 'D' | 'E'; correctAnswer?: string; studentId?: string }) => {
    const { sessionCode, questionId, choice, correctAnswer, studentId } = data

    // Check if voting is paused
    if (sessionVotingPaused.get(sessionCode)) {
      socket.emit('vote-rejected', { reason: 'Voting is paused' })
      return
    }

    // Check if this question is the active one
    const currentQ = sessionCurrentQuestion.get(sessionCode)
    if (currentQ !== questionId) {
      socket.emit('vote-rejected', { reason: 'This question is not active' })
      return
    }

    // Anti-double-vote: check if this socket already voted on this question
    if (!socketVotedQuestions.has(socket.id)) {
      socketVotedQuestions.set(socket.id, new Set())
    }
    const votedSet = socketVotedQuestions.get(socket.id)!
    if (votedSet.has(questionId)) {
      socket.emit('vote-rejected', { reason: 'You already voted on this question' })
      return
    }
    votedSet.add(questionId)

    // Update vote counts
    const counts = initVoteCounts(sessionCode, questionId)
    counts[choice]++
    counts.total++

    // Track score for student
    if (studentId) {
      if (!sessionScores.has(sessionCode)) {
        sessionScores.set(sessionCode, new Map())
      }
      const scoreMap = sessionScores.get(sessionCode)!
      if (!scoreMap.has(studentId)) {
        // Try to get name from socket mapping
        const socketInfo = studentBySocket.get(socket.id)
        scoreMap.set(studentId, {
          name: socketInfo?.name || 'Unknown',
          rgm: studentId,
          score: 0,
          answers: 0,
          corrects: 0,
        })
      }
      const studentScore = scoreMap.get(studentId)!
      studentScore.answers++
      if (correctAnswer && choice === correctAnswer) {
        studentScore.score++
        studentScore.corrects++
      }
    }

    // Acknowledge the vote to the student
    socket.emit('vote-accepted', { choice, questionId })

    // Queue batched vote results broadcast instead of immediate
    pendingVoteBroadcasts.add(sessionCode)
  })

  // Presenter pauses/resumes voting
  socket.on('toggle-voting', (data: { sessionCode: string; paused: boolean }) => {
    const { sessionCode, paused } = data
    sessionVotingPaused.set(sessionCode, paused)

    io.to(`session:${sessionCode}`).emit('voting-toggled', { paused })
  })

  // Presenter reveals the answer
  socket.on('reveal-answer', (data: { sessionCode: string; questionId: string; correctAnswer: string }) => {
    const { sessionCode, questionId, correctAnswer } = data

    // Broadcast the answer with ranking (immediate — rare event)
    const ranking = getRanking(sessionCode)
    io.to(`session:${sessionCode}`).emit('answer-revealed', {
      questionId,
      correctAnswer,
      ranking,
    })

    // Also immediately broadcast final vote results for this question
    const key = getVoteKey(sessionCode, questionId)
    const results = sessionVoteCounts.get(key)
    if (results) {
      io.to(`session:${sessionCode}`).emit('vote-results', { ...results })
    }
    pendingVoteBroadcasts.delete(sessionCode)
  })

  // Get ranking for a session
  socket.on('get-ranking', (data: { sessionCode: string }) => {
    const ranking = getRanking(data.sessionCode)
    socket.emit('ranking-data', ranking)
  })

  // Presenter moves to next question
  socket.on('next-question', (data: { sessionCode: string; questionId: string | null }) => {
    const { sessionCode, questionId } = data
    sessionCurrentQuestion.set(sessionCode, questionId || null)

    if (questionId) {
      sessionVotingPaused.set(sessionCode, false)
      initVoteCounts(sessionCode, questionId)

      io.to(`session:${sessionCode}`).emit('question-activated', {
        questionId,
        votingPaused: false,
      })

      const key = getVoteKey(sessionCode, questionId)
      const results = sessionVoteCounts.get(key)
      io.to(`session:${sessionCode}`).emit('vote-results', results)
    } else {
      io.to(`session:${sessionCode}`).emit('session-finished')
    }
  })

  // Presenter ends the session
  socket.on('end-session', (data: { sessionCode: string }) => {
    const { sessionCode } = data
    sessionCurrentQuestion.delete(sessionCode)
    sessionVotingPaused.delete(sessionCode)

    io.to(`session:${sessionCode}`).emit('session-finished')
  })

  // Presenter resets the session
  socket.on('session-reset', (data: { sessionCode: string }) => {
    const { sessionCode } = data

    // Clear all in-memory state for this session
    sessionCurrentQuestion.set(sessionCode, null)
    sessionVotingPaused.delete(sessionCode)
    sessionScores.delete(sessionCode)
    sessionTotalParticipants.delete(sessionCode)

    // Clear all vote counts for this session
    for (const key of sessionVoteCounts.keys()) {
      if (key.startsWith(`${sessionCode}:`)) {
        sessionVoteCounts.delete(key)
      }
    }

    // Clear voted questions for all sockets in this session
    const participants = sessionParticipants.get(sessionCode)
    if (participants) {
      for (const socketId of participants) {
        socketVotedQuestions.delete(socketId)
      }
    }

    // Broadcast reset to all clients in the session
    io.to(`session:${sessionCode}`).emit('session-reset', {
      participantCount: participants?.size || 0,
    })
  })

  // Toggle QR Code display on presentation screen
  socket.on('show-qr', (data: { sessionCode: string; visible: boolean }) => {
    const { sessionCode, visible } = data
    io.to(`session:${sessionCode}`).emit('show-qr', { visible })
  })

  // Handle disconnect — with grace period to prevent count fluctuation
  socket.on('disconnect', () => {
    const sessionCode = socketSession.get(socket.id)

    if (sessionCode) {
      // Don't remove immediately — schedule removal after grace period
      // This prevents the participant count from dropping when a phone
      // briefly loses connection (screen off, network hiccup, etc.)
      const timer = setTimeout(() => {
        const participants = sessionParticipants.get(sessionCode)
        if (participants) {
          participants.delete(socket.id)
          pendingParticipantBroadcasts.add(sessionCode)
        }
        pendingRemovals.delete(socket.id)
      }, GRACE_PERIOD_MS)

      pendingRemovals.set(socket.id, { sessionCode, timer })

      // Clean up socket-based maps immediately (these don't affect count)
      socketSession.delete(socket.id)
    }

    studentBySocket.delete(socket.id)
    socketVotedQuestions.delete(socket.id)
  })

  socket.on('error', () => {
    // Silently handle socket errors to prevent crashes
  })
})

const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`ENADE Quiz real-time server running on port ${PORT}`)
})

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...')
  httpServer.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down...')
  httpServer.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})
