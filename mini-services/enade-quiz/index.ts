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
})

// In-memory state for real-time features
// Map of sessionCode -> Set of socket IDs (participants)
const sessionParticipants = new Map<string, Set<string>>()
// Map of sessionCode -> current question ID
const sessionCurrentQuestion = new Map<string, string | null>()
// Map of sessionCode -> voting paused state
const sessionVotingPaused = new Map<string, boolean>()
// Map of `${sessionCode}:${questionId}` -> vote counts
const sessionVoteCounts = new Map<string, { A: number; B: number; C: number; D: number; E: number; total: number }>()

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

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`)

  // Join a session room
  socket.on('join-session', (data: { sessionCode: string; role: 'presenter' | 'student' }) => {
    const { sessionCode, role } = data
    socket.join(`session:${sessionCode}`)
    
    if (!sessionParticipants.has(sessionCode)) {
      sessionParticipants.set(sessionCode, new Set())
    }
    
    if (role === 'student') {
      sessionParticipants.get(sessionCode)!.add(socket.id)
    }
    
    // Send current state to the newly joined client
    const participantCount = sessionParticipants.get(sessionCode)?.size || 0
    socket.emit('session-state', {
      participantCount,
      currentQuestionId: sessionCurrentQuestion.get(sessionCode) || null,
      votingPaused: sessionVotingPaused.get(sessionCode) || false,
    })
    
    // Broadcast updated participant count
    io.to(`session:${sessionCode}`).emit('participant-count', participantCount)
    console.log(`${role} joined session ${sessionCode}, participants: ${participantCount}`)
  })

  // Leave a session
  socket.on('leave-session', (data: { sessionCode: string }) => {
    const { sessionCode } = data
    socket.leave(`session:${sessionCode}`)
    
    const participants = sessionParticipants.get(sessionCode)
    if (participants) {
      participants.delete(socket.id)
      const count = participants.size
      io.to(`session:${sessionCode}`).emit('participant-count', count)
    }
  })

  // Presenter activates a question
  socket.on('activate-question', (data: { sessionCode: string; questionId: string }) => {
    const { sessionCode, questionId } = data
    sessionCurrentQuestion.set(sessionCode, questionId)
    sessionVotingPaused.set(sessionCode, false)
    
    // Initialize vote counts for this question
    initVoteCounts(sessionCode, questionId)
    
    // Notify all clients in the session
    io.to(`session:${sessionCode}`).emit('question-activated', {
      questionId,
      votingPaused: false,
    })
    
    // Send current results (likely zero)
    const key = getVoteKey(sessionCode, questionId)
    const results = sessionVoteCounts.get(key)
    io.to(`session:${sessionCode}`).emit('vote-results', results)
    
    console.log(`Question ${questionId} activated in session ${sessionCode}`)
  })

  // Student submits a vote
  socket.on('submit-vote', (data: { sessionCode: string; questionId: string; choice: 'A' | 'B' | 'C' | 'D' | 'E' }) => {
    const { sessionCode, questionId, choice } = data
    
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
    
    // Update vote counts
    const counts = initVoteCounts(sessionCode, questionId)
    counts[choice]++
    counts.total++
    
    // Acknowledge the vote to the student
    socket.emit('vote-accepted', { choice, questionId })
    
    // Broadcast updated results to everyone in the session
    io.to(`session:${sessionCode}`).emit('vote-results', { ...counts })
    
    console.log(`Vote ${choice} in session ${sessionCode}, question ${questionId}. Total: ${counts.total}`)
  })

  // Presenter pauses/resumes voting
  socket.on('toggle-voting', (data: { sessionCode: string; paused: boolean }) => {
    const { sessionCode, paused } = data
    sessionVotingPaused.set(sessionCode, paused)
    
    io.to(`session:${sessionCode}`).emit('voting-toggled', { paused })
    console.log(`Voting ${paused ? 'paused' : 'resumed'} in session ${sessionCode}`)
  })

  // Presenter reveals the answer
  socket.on('reveal-answer', (data: { sessionCode: string; questionId: string; correctAnswer: string }) => {
    const { sessionCode, questionId, correctAnswer } = data
    
    io.to(`session:${sessionCode}`).emit('answer-revealed', {
      questionId,
      correctAnswer,
    })
    
    console.log(`Answer revealed for question ${questionId} in session ${sessionCode}: ${correctAnswer}`)
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
    
    console.log(`Next question in session ${sessionCode}: ${questionId || 'finished'}`)
  })

  // Presenter ends the session
  socket.on('end-session', (data: { sessionCode: string }) => {
    const { sessionCode } = data
    sessionCurrentQuestion.delete(sessionCode)
    sessionVotingPaused.delete(sessionCode)
    
    io.to(`session:${sessionCode}`).emit('session-finished')
    console.log(`Session ${sessionCode} ended`)
  })

  // Handle disconnect
  socket.on('disconnect', () => {
    // Remove from all sessions
    for (const [sessionCode, participants] of sessionParticipants.entries()) {
      if (participants.has(socket.id)) {
        participants.delete(socket.id)
        const count = participants.size
        io.to(`session:${sessionCode}`).emit('participant-count', count)
      }
    }
    console.log(`Disconnected: ${socket.id}`)
  })

  socket.on('error', (error) => {
    console.error(`Socket error (${socket.id}):`, error)
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
