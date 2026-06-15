// Session types
export type SessionStatus = 'waiting' | 'active' | 'finished'

export interface Session {
  id: string
  code: string
  title: string
  status: SessionStatus
  currentQuestionId: string | null
  createdAt: string
  updatedAt: string
  questions: Question[]
}

export interface Question {
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
  correctAnswer: 'A' | 'B' | 'C' | 'D' | 'E'
  imageUrl: string | null
  isRevealed: boolean
  orderIndex: number
  createdAt: string
  updatedAt: string
}

export interface Vote {
  id: string
  questionId: string
  choice: 'A' | 'B' | 'C' | 'D' | 'E'
  votedAt: string
}

export interface VoteResults {
  A: number
  B: number
  C: number
  D: number
  E: number
  total: number
}

// Socket event types
export interface SessionState {
  participantCount: number
  currentQuestionId: string | null
  votingPaused: boolean
}

export interface QuestionActivated {
  questionId: string
  votingPaused: boolean
}

export interface AnswerRevealed {
  questionId: string
  correctAnswer: string
}

// Import/Export types
export interface QuestionImport {
  year: number
  course: string
  text: string
  alternatives: {
    A: string
    B: string
    C: string
    D: string
    E: string
  }
  correctAnswer: 'A' | 'B' | 'C' | 'D' | 'E'
}

// UEMS Courses list
export const UEMS_COURSES = [
  'Administração',
  'Agronomia',
  'Biologia',
  'Ciência da Computação',
  'Ciências Contábeis',
  'Comunicação Social - Jornalismo',
  'Comunicação Social - Publicidade e Propaganda',
  'Direito',
  'Educação Física',
  'Enfermagem',
  'Engenharia Civil',
  'Engenharia de Alimentos',
  'Engenharia de Produção',
  'Farmácia',
  'Fisioterapia',
  'Geografia',
  'História',
  'Letras - Português e Inglês',
  'Matemática',
  'Medicina',
  'Medicina Veterinária',
  'Nutrição',
  'Odontologia',
  'Pedagogia',
  'Psicologia',
  'Sistemas de Informação',
  'Zootecnia',
] as const

// Pie chart colors
export const CHART_COLORS: Record<string, string> = {
  A: '#00338C',  // Azul UEMS
  B: '#C8A84B',  // Dourado UEMS
  C: '#2196F3',  // Azul claro
  D: '#4CAF50',  // Verde
  E: '#F44336',  // Vermelho
}

export const CHART_COLOR_NAMES: Record<string, string> = {
  A: 'Azul UEMS',
  B: 'Dourado',
  C: 'Azul Claro',
  D: 'Verde',
  E: 'Vermelho',
}
