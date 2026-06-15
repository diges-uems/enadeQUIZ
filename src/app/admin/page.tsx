'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { io, Socket } from 'socket.io-client'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Lock,
  Plus,
  Trash2,
  ExternalLink,
  Settings2,
  GripVertical,
  Pencil,
  FileJson,
  LogOut,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Pause,
  Play,
  KeyRound,
  Users,
  Trophy,
  ImagePlus,
  X,
  Monitor,
  PlayCircle,
  StopCircle,
  Zap,
  Activity,
} from 'lucide-react'
import type { Session, Question, SessionStatus } from '@/types'
import { UEMS_COURSES, CHART_COLORS } from '@/types'

// ─── Types ────────────────────────────────────────────────────────
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

const ALT_LABELS = ['A', 'B', 'C', 'D', 'E'] as const

// ─── Status Badge ───────────────────────────────────────────────────
function StatusBadge({ status }: { status: SessionStatus }) {
  const config: Record<SessionStatus, { label: string; className: string }> = {
    waiting: {
      label: 'Aguardando',
      className:
        'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800',
    },
    active: {
      label: 'Ativa',
      className:
        'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
    },
    finished: {
      label: 'Finalizada',
      className:
        'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800/30 dark:text-gray-400 dark:border-gray-700',
    },
  }
  const c = config[status] || config.waiting
  return (
    <Badge variant="outline" className={c.className}>
      {c.label}
    </Badge>
  )
}

// ─── Sortable Question Item ─────────────────────────────────────────
function SortableQuestionItem({
  question,
  index,
  onEdit,
  onDelete,
}: {
  question: Question
  index: number
  onEdit: (q: Question) => void
  onDelete: (id: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: question.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-3 rounded-lg border p-3 ${
        isDragging
          ? 'z-50 border-[#C8A84B] bg-[#C8A84B]/5 shadow-lg'
          : 'border-border bg-card hover:bg-accent/50'
      }`}
    >
      <button
        className="mt-1 cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-bold text-[#00338C] dark:text-[#C8A84B]">
            #{index + 1}
          </span>
          <span className="text-xs text-muted-foreground">
            {question.year} &middot; {question.course}
          </span>
          {question.imageUrl && (
            <ImagePlus className="size-3 text-blue-500" />
          )}
        </div>
        <p className="text-sm line-clamp-2 text-foreground">
          {question.text}
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => onEdit(question)}
          title="Editar questão"
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-destructive hover:text-destructive"
          onClick={() => onDelete(question.id)}
          title="Excluir questão"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ─── Question Form (Dialog) ─────────────────────────────────────────
function QuestionFormDialog({
  open,
  onOpenChange,
  question,
  sessionId,
  sessionCode,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  question: Question | null
  sessionId: string
  sessionCode: string
  onSave: () => void
}) {
  const [text, setText] = useState('')
  const [year, setYear] = useState('2025')
  const [course, setCourse] = useState('')
  const [altA, setAltA] = useState('')
  const [altB, setAltB] = useState('')
  const [altC, setAltC] = useState('')
  const [altD, setAltD] = useState('')
  const [altE, setAltE] = useState('')
  const [correctAnswer, setCorrectAnswer] = useState('A')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isEditing = question !== null

  useEffect(() => {
    if (open) {
      if (question) {
        setText(question.text)
        setYear(String(question.year))
        setCourse(question.course)
        setAltA(question.altA)
        setAltB(question.altB)
        setAltC(question.altC)
        setAltD(question.altD)
        setAltE(question.altE)
        setCorrectAnswer(question.correctAnswer)
        setImageUrl(question.imageUrl)
      } else {
        setText('')
        setYear('2025')
        setCourse('')
        setAltA('')
        setAltB('')
        setAltC('')
        setAltD('')
        setAltE('')
        setCorrectAnswer('A')
        setImageUrl(null)
      }
    }
  }, [open, question])

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate type
    const validTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
    if (!validTypes.includes(file.type)) {
      toast.error('Tipo de arquivo inválido. Use PNG, JPG, GIF ou WebP.')
      return
    }

    // Validate size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Máximo 5MB.')
      return
    }

    setUploading(true)
    try {
      // Convert to base64 data URL for reliable upload
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl, filename: file.name }),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Erro no upload')
      }

      const data = await res.json()
      setImageUrl(data.url)
      toast.success('Imagem enviada com sucesso!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao enviar imagem.')
    } finally {
      setUploading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleRemoveImage = () => {
    setImageUrl(null)
  }

  const handleSubmit = async () => {
    if (!text.trim() || !altA.trim() || !altB.trim() || !altC.trim() || !altD.trim() || !altE.trim()) {
      toast.error('Preencha todos os campos obrigatórios.')
      return
    }

    setSaving(true)
    try {
      if (isEditing && question) {
        const res = await fetch(
          `/api/session/${sessionCode}/questions/${question.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text,
              year: parseInt(year),
              course,
              altA,
              altB,
              altC,
              altD,
              altE,
              correctAnswer,
              imageUrl,
            }),
          }
        )
        if (!res.ok) throw new Error('Erro ao atualizar questão')
        toast.success('Questão atualizada com sucesso!')
      } else {
        const res = await fetch(`/api/session/${sessionCode}/questions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            year: parseInt(year),
            course,
            altA,
            altB,
            altC,
            altD,
            altE,
            correctAnswer,
            imageUrl,
          }),
        })
        if (!res.ok) throw new Error('Erro ao criar questão')
        toast.success('Questão criada com sucesso!')
      }
      onSave()
      onOpenChange(false)
    } catch {
      toast.error('Erro ao salvar questão.')
    } finally {
      setSaving(false)
    }
  }

  const years = Array.from({ length: 11 }, (_, i) => 2015 + i)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Editar Questão' : 'Adicionar Questão'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Altere os campos desejados e salve.'
              : 'Preencha os dados da questão do ENADE.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="q-text">Enunciado *</Label>
            <Textarea
              id="q-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder="Digite o enunciado da questão..."
            />
          </div>

          {/* Image Upload */}
          <div className="grid gap-2">
            <Label>Imagem (opcional)</Label>
            <div className="flex items-center gap-3">
              {imageUrl ? (
                <div className="relative group rounded-lg border border-border overflow-hidden">
                  <img
                    src={imageUrl}
                    alt="Imagem da questão"
                    className="max-h-32 max-w-full object-contain"
                  />
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="absolute top-1 right-1 size-6 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100"
                    title="Remover imagem"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ImagePlus className="size-4" />
                    )}
                    {uploading ? 'Enviando...' : 'Adicionar Imagem'}
                  </Button>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={handleImageUpload}
                className="hidden"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              PNG, JPG, GIF ou WebP. Máximo 5MB.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Ano ENADE *</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione o ano" />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Curso</Label>
              <Select value={course} onValueChange={setCourse}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione o curso" />
                </SelectTrigger>
                <SelectContent>
                  {UEMS_COURSES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3">
            <Label>Alternativas *</Label>
            {[
              { letter: 'A', value: altA, setter: setAltA },
              { letter: 'B', value: altB, setter: setAltB },
              { letter: 'C', value: altC, setter: setAltC },
              { letter: 'D', value: altD, setter: setAltD },
              { letter: 'E', value: altE, setter: setAltE },
            ].map(({ letter, value, setter }) => (
              <div key={letter} className="flex items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded bg-[#00338C] text-xs font-bold text-white shrink-0">
                  {letter}
                </span>
                <Input
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  placeholder={`Alternativa ${letter}`}
                  className="flex-1"
                />
              </div>
            ))}
          </div>

          <div className="grid gap-2">
            <Label>Gabarito *</Label>
            <RadioGroup
              value={correctAnswer}
              onValueChange={setCorrectAnswer}
              className="flex gap-4"
            >
              {['A', 'B', 'C', 'D', 'E'].map((l) => (
                <div key={l} className="flex items-center gap-1.5">
                  <RadioGroupItem value={l} id={`gab-${l}`} />
                  <Label htmlFor={`gab-${l}`} className="cursor-pointer">
                    {l}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || uploading}
            className="bg-[#00338C] hover:bg-[#00338C]/90 text-white"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            {isEditing ? 'Salvar Alterações' : 'Criar Questão'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Import JSON Dialog ──────────────────────────────────────────────
function ImportJsonDialog({
  open,
  onOpenChange,
  sessionCode,
  onImport,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessionCode: string
  onImport: () => void
}) {
  const [jsonText, setJsonText] = useState('')
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    if (open) setJsonText('')
  }, [open])

  const handleImport = async () => {
    if (!jsonText.trim()) {
      toast.error('Cole o JSON no campo acima.')
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      toast.error('JSON inválido. Verifique o formato.')
      return
    }
    if (!Array.isArray(parsed)) {
      toast.error('O JSON deve ser um array de questões.')
      return
    }

    setImporting(true)
    try {
      const res = await fetch(`/api/session/${sessionCode}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      })
      if (!res.ok) throw new Error('Erro ao importar')
      const data = await res.json()
      toast.success(`${Array.isArray(data) ? data.length : 1} questão(ões) importada(s)!`)
      onImport()
      onOpenChange(false)
    } catch {
      toast.error('Erro ao importar questões.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar Questões (JSON)</DialogTitle>
          <DialogDescription>
            Cole um array JSON com as questões no formato especificado.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="json-import">JSON</Label>
          <Textarea
            id="json-import"
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            rows={12}
            className="font-mono text-xs"
            placeholder={`[\n  {\n    "year": 2023,\n    "course": "Administração",\n    "text": "Enunciado...",\n    "alternatives": { "A": "...", "B": "...", "C": "...", "D": "...", "E": "..." },\n    "correctAnswer": "B"\n  }\n]`}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleImport}
            disabled={importing}
            className="bg-[#00338C] hover:bg-[#00338C]/90 text-white"
          >
            {importing && <Loader2 className="size-4 animate-spin" />}
            Importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Vencedores Dialog ──────────────────────────────────────────────
function VencedoresDialog({
  open,
  onOpenChange,
  ranking,
  totalQuestions,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  ranking: RankingEntry[]
  totalQuestions: number
}) {
  const medals = ['1o', '2o', '3o']
  const medalColors = [
    'border-yellow-400 bg-yellow-50 dark:border-yellow-600 dark:bg-yellow-900/20',
    'border-gray-400 bg-gray-50 dark:border-gray-500 dark:bg-gray-800/20',
    'border-amber-600 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20',
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Trophy className="size-5 text-[#C8A84B]" />
            Ranking — Top 3
          </DialogTitle>
          <DialogDescription>
            Maiores pontuadores da sessão
          </DialogDescription>
        </DialogHeader>

        {ranking.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <p>Nenhum voto registrado ainda</p>
          </div>
        ) : (
          <div className="grid gap-3 py-2">
            {ranking.slice(0, 3).map((entry, idx) => (
              <div
                key={entry.rgm}
                className={`flex items-center gap-3 p-3 rounded-xl border ${medalColors[idx] || 'border-border'}`}
              >
                <span className="text-2xl">{medals[idx]}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold truncate">{entry.name}</p>
                  <p className="text-xs text-muted-foreground">RGM: {entry.rgm}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[#C8A84B] font-bold text-lg">
                    {entry.corrects}/{totalQuestions}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {entry.corrects === 1 ? 'acerto' : 'acertos'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Admin Page ────────────────────────────────────────────────
export default function AdminPage() {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')

  // Dashboard state
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(false)

  // New session dialog
  const [newSessionOpen, setNewSessionOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [creatingSession, setCreatingSession] = useState(false)

  // Session management
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [managingSession, setManagingSession] = useState(false)
  const [activeTab, setActiveTab] = useState('questoes')

  // Question form
  const [questionFormOpen, setQuestionFormOpen] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null)

  // Import JSON
  const [importJsonOpen, setImportJsonOpen] = useState(false)

  // Delete confirmation
  const [deleteSessionCode, setDeleteSessionCode] = useState<string | null>(null)
  const [deleteQuestionId, setDeleteQuestionId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ── Presenter / Socket state ──
  const [socket, setSocket] = useState<Socket | null>(null)
  const [participantCount, setParticipantCount] = useState(0)
  const [votingPaused, setVotingPaused] = useState(false)
  const [voteResults, setVoteResults] = useState<VoteResults>({
    A: 0, B: 0, C: 0, D: 0, E: 0, total: 0,
  })
  const [revealed, setRevealed] = useState(false)
  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(null)
  const [isNavigating, setIsNavigating] = useState(false)
  const [ranking, setRanking] = useState<RankingEntry[]>([])
  const [showRanking, setShowRanking] = useState(false)
  const [showQrOnPresentation, setShowQrOnPresentation] = useState(false)
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)

  // Stress test state
  const [stressTestOpen, setStressTestOpen] = useState(false)
  const [stressTestRunning, setStressTestRunning] = useState(false)
  const [stressTestCount, setStressTestCount] = useState(1000)
  const [stressTestResult, setStressTestResult] = useState<{
    totalStudents: number
    connected: number
    voted: number
    failed: number
    durationMs: number
    votesPerSecond: number
    voteDistribution: { A: number; B: number; C: number; D: number; E: number }
    errors: string[]
  } | null>(null)

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // ── Derived values for presenter ──
  const currentQuestion = selectedSession?.questions.find(
    (q) => q.id === currentQuestionId
  ) ?? null
  const currentIndex = selectedSession?.questions.findIndex(
    (q) => q.id === currentQuestionId
  ) ?? -1
  const totalQuestions = selectedSession?.questions.length ?? 0
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < totalQuestions - 1 && totalQuestions > 0

  // Check auth on mount
  useEffect(() => {
    const token = sessionStorage.getItem('admin_token')
    if (token) setIsAuthenticated(true)
  }, [])

  // Fetch sessions when authenticated
  const fetchSessions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/session')
      if (res.ok) {
        const data = await res.json()
        setSessions(data)
      }
    } catch {
      toast.error('Erro ao carregar sessões.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated) fetchSessions()
  }, [isAuthenticated, fetchSessions])

  // ── Socket connection when managing a session ──
  useEffect(() => {
    if (!managingSession || !selectedSession) {
      // Disconnect when leaving session management
      if (socket) {
        socket.disconnect()
        setSocket(null)
      }
      return
    }

    const sessionCode = selectedSession.code

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
        sessionCode,
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
      if (data.currentQuestionId) {
        setCurrentQuestionId(data.currentQuestionId)
      }
      setVotingPaused(data.votingPaused)
    })

    socketInstance.on('ranking-data', (data: RankingEntry[]) => {
      setRanking(data)
    })

    setSocket(socketInstance)

    // Reset presenter state
    setCurrentQuestionId(selectedSession.currentQuestionId)
    setVotingPaused(false)
    setVoteResults({ A: 0, B: 0, C: 0, D: 0, E: 0, total: 0 })
    setRevealed(false)
    setParticipantCount(0)
    setRanking([])

    if (selectedSession.currentQuestionId) {
      const q = selectedSession.questions.find(
        (q) => q.id === selectedSession.currentQuestionId
      )
      if (q) setRevealed(q.isRevealed)
    }

    return () => {
      socketInstance.disconnect()
      setSocket(null)
    }
  }, [managingSession, selectedSession?.code])

  // ── Auth handlers ────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthLoading(true)
    setAuthError('')
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        const data = await res.json()
        sessionStorage.setItem('admin_token', data.token)
        setIsAuthenticated(true)
        toast.success('Autenticado com sucesso!')
      } else {
        setAuthError('Senha incorreta.')
      }
    } catch {
      setAuthError('Erro de conexão.')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogout = () => {
    sessionStorage.removeItem('admin_token')
    setIsAuthenticated(false)
    setSelectedSession(null)
    setManagingSession(false)
    setPassword('')
  }

  // ── Session handlers ─────────────────────────────────────────
  const handleCreateSession = async () => {
    if (!newTitle.trim()) {
      toast.error('Informe um título para a sessão.')
      return
    }
    setCreatingSession(true)
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() }),
      })
      if (!res.ok) throw new Error()
      const session = await res.json()
      toast.success(`Sessão criada! Código: ${session.code}`)
      setNewTitle('')
      setNewSessionOpen(false)
      fetchSessions()
    } catch {
      toast.error('Erro ao criar sessão.')
    } finally {
      setCreatingSession(false)
    }
  }

  const handleDeleteSession = async () => {
    if (!deleteSessionCode) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/session/${deleteSessionCode}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error()
      toast.success('Sessão excluída.')
      if (selectedSession?.code === deleteSessionCode) {
        setSelectedSession(null)
        setManagingSession(false)
      }
      fetchSessions()
    } catch {
      toast.error('Erro ao excluir sessão.')
    } finally {
      setDeleting(false)
      setDeleteSessionCode(null)
    }
  }

  const handleDuplicateSession = async (sourceCode: string) => {
    try {
      // Fetch the source session
      const res = await fetch(`/api/session/${sourceCode}`)
      if (!res.ok) throw new Error()
      const source: Session = await res.json()

      // Create a new session with "- Cópia" suffix
      const createRes = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${source.title} — Cópia`,
        }),
      })
      if (!createRes.ok) throw new Error()
      const newSession = await createRes.json()

      // Copy all questions to the new session
      for (const q of source.questions) {
        await fetch(`/api/session/${newSession.code}/questions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: q.text,
            year: q.year,
            course: q.course,
            altA: q.altA,
            altB: q.altB,
            altC: q.altC,
            altD: q.altD,
            altE: q.altE,
            correctAnswer: q.correctAnswer,
            imageUrl: q.imageUrl,
          }),
        })
      }

      toast.success(`Sessão duplicada: ${newSession.code}`)
      fetchSessions()
    } catch {
      toast.error('Erro ao duplicar sessão.')
    }
  }

  const handleDeleteQuestion = async () => {
    if (!deleteQuestionId || !selectedSession) return
    setDeleting(true)
    try {
      const res = await fetch(
        `/api/session/${selectedSession.code}/questions/${deleteQuestionId}`,
        { method: 'DELETE' }
      )
      if (!res.ok) throw new Error()
      toast.success('Questão excluída.')
      refreshSession()
    } catch {
      toast.error('Erro ao excluir questão.')
    } finally {
      setDeleting(false)
      setDeleteQuestionId(null)
    }
  }

  // ── Session detail / management ──────────────────────────────
  const openSessionManagement = (session: Session) => {
    setSelectedSession(session)
    setManagingSession(true)
    setActiveTab('questoes')
  }

  const refreshSession = useCallback(async () => {
    if (!selectedSession) return
    try {
      const res = await fetch(`/api/session/${selectedSession.code}`)
      if (res.ok) {
        const data = await res.json()
        setSelectedSession(data)
      }
    } catch {
      toast.error('Erro ao atualizar sessão.')
    }
  }, [selectedSession])

  // ── Drag & drop reorder ──────────────────────────────────────
  const handleDragEnd = async (event: DragEndEvent) => {
    if (!selectedSession) return
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = selectedSession.questions.findIndex(
      (q) => q.id === active.id
    )
    const newIndex = selectedSession.questions.findIndex(
      (q) => q.id === over.id
    )
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(selectedSession.questions, oldIndex, newIndex)
    // Optimistic update
    setSelectedSession({ ...selectedSession, questions: reordered })

    try {
      await fetch(`/api/session/${selectedSession.code}/questions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionIds: reordered.map((q) => q.id) }),
      })
    } catch {
      toast.error('Erro ao reordenar questões.')
      refreshSession()
    }
  }

  // ── Presenter handlers ──────────────────────────────────────
  const updateSession = async (updates: {
    status?: string
    currentQuestionId?: string | null
  }) => {
    if (!selectedSession) return
    try {
      await fetch(`/api/session/${selectedSession.code}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
    } catch (err) {
      console.error('Failed to update session:', err)
    }
  }

  const handleStartSession = async () => {
    if (!selectedSession) return
    await updateSession({ status: 'active' })
    setSelectedSession({ ...selectedSession, status: 'active' })
    socket?.emit('activate-question', {
      sessionCode: selectedSession.code,
      questionId: selectedSession.questions[0]?.id,
    })
    toast.success('Sessão iniciada!')
  }

  const handleEndSession = async () => {
    if (!selectedSession) return
    await updateSession({ status: 'finished' })
    setSelectedSession({ ...selectedSession, status: 'finished' })
    socket?.emit('end-session', {
      sessionCode: selectedSession.code,
    })
    toast.success('Sessão encerrada!')
  }

  const handlePrevious = async () => {
    if (!selectedSession || !hasPrev || isNavigating) return
    setIsNavigating(true)
    const prevQuestion = selectedSession.questions[currentIndex - 1]
    setCurrentQuestionId(prevQuestion.id)
    setRevealed(prevQuestion.isRevealed)
    setVoteResults({ A: 0, B: 0, C: 0, D: 0, E: 0, total: 0 })
    await updateSession({ currentQuestionId: prevQuestion.id })
    socket?.emit('activate-question', {
      sessionCode: selectedSession.code,
      questionId: prevQuestion.id,
    })
    setTimeout(() => setIsNavigating(false), 300)
  }

  const handleNext = async () => {
    if (!selectedSession || !hasNext || isNavigating) return
    setIsNavigating(true)
    const nextQuestion = selectedSession.questions[currentIndex + 1]
    setCurrentQuestionId(nextQuestion.id)
    setRevealed(nextQuestion.isRevealed)
    setVoteResults({ A: 0, B: 0, C: 0, D: 0, E: 0, total: 0 })
    await updateSession({ currentQuestionId: nextQuestion.id })
    socket?.emit('next-question', {
      sessionCode: selectedSession.code,
      questionId: nextQuestion.id,
    })
    setTimeout(() => setIsNavigating(false), 300)
  }

  const handleToggleVoting = () => {
    const newPaused = !votingPaused
    setVotingPaused(newPaused)
    socket?.emit('toggle-voting', {
      sessionCode: selectedSession?.code,
      paused: newPaused,
    })
  }

  const handleRevealAnswer = async () => {
    if (!currentQuestion || !selectedSession) return
    setRevealed(true)
    await fetch(
      `/api/session/${selectedSession.code}/questions/${currentQuestion.id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRevealed: true }),
      }
    )
    socket?.emit('reveal-answer', {
      sessionCode: selectedSession.code,
      questionId: currentQuestion.id,
      correctAnswer: currentQuestion.correctAnswer,
    })
  }

  const handleGetRanking = () => {
    socket?.emit('get-ranking', { sessionCode: selectedSession?.code })
    setShowRanking(true)
  }

  const handleResetSession = async () => {
    if (!selectedSession) return
    try {
      const res = await fetch(`/api/session/${selectedSession.code}/reset`, { method: 'POST' })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setSelectedSession(data)
      setCurrentQuestionId(null)
      setRevealed(false)
      setVotingPaused(false)
      setVoteResults({ A: 0, B: 0, C: 0, D: 0, E: 0, total: 0 })
      setRanking([])
      setShowQrOnPresentation(false)
      socket?.emit('session-reset', { sessionCode: selectedSession.code })
      toast.success('Sessão resetada com sucesso!')
    } catch {
      toast.error('Erro ao resetar sessão.')
    }
    setResetConfirmOpen(false)
  }

  const handleStressTest = async () => {
    if (!selectedSession || !currentQuestionId) {
      toast.error('Selecione uma questão antes de iniciar o stress test.')
      return
    }
    setStressTestRunning(true)
    setStressTestResult(null)

    const startTime = Date.now()
    const result = {
      totalStudents: stressTestCount,
      connected: 0,
      voted: 0,
      failed: 0,
      durationMs: 0,
      votesPerSecond: 0,
      voteDistribution: { A: 0, B: 0, C: 0, D: 0, E: 0 },
      errors: [] as string[],
    }

    const altLabels = ['A', 'B', 'C', 'D', 'E'] as const
    // Browser limits ~6 concurrent WebSocket connections to same origin
    // Use waves: connect small batch -> join -> vote -> disconnect -> next batch
    const WAVE_SIZE = 6

    const simulateStudent = (idx: number): Promise<void> => {
      return new Promise<void>((resolve) => {
        try {
          const s = io('/?XTransformPort=3003', {
            transports: ['websocket'],
            forceNew: true,
            reconnection: false,
            timeout: 5000,
          })

          const timeout = setTimeout(() => {
            result.failed++
            if (result.errors.length < 10) {
              result.errors.push(`Aluno ${idx + 1}: timeout`)
            }
            try { s.disconnect() } catch { /* */ }
            resolve()
          }, 8000)

          s.on('connect', () => {
            result.connected++
            s.emit('join-session', {
              sessionCode: selectedSession.code,
              role: 'student',
              name: `Aluno Stress ${idx + 1}`,
              rgm: `STRESS-${String(idx + 1).padStart(5, '0')}`,
            })

            // Vote immediately after joining
            const correctAnswer = currentQuestion?.correctAnswer
            let choice: string
            const rand = Math.random()
            if (correctAnswer && rand < 0.30) {
              choice = correctAnswer
            } else {
              const wrong = altLabels.filter((a) => a !== correctAnswer)
              choice = wrong[Math.floor(Math.random() * wrong.length)]
            }

            s.emit('submit-vote', {
              sessionCode: selectedSession.code,
              questionId: currentQuestionId,
              choice,
              correctAnswer: correctAnswer || undefined,
              studentId: `STRESS-${String(idx + 1).padStart(5, '0')}`,
            })

            result.voted++
            result.voteDistribution[choice as keyof typeof result.voteDistribution]++

            // Disconnect right away to free the connection slot
            clearTimeout(timeout)
            setTimeout(() => {
              try { s.disconnect() } catch { /* */ }
              resolve()
            }, 50)
          })

          s.on('connect_error', (err: Error) => {
            clearTimeout(timeout)
            result.failed++
            if (result.errors.length < 10) {
              result.errors.push(`Aluno ${idx + 1}: ${err.message}`)
            }
            try { s.disconnect() } catch { /* */ }
            resolve()
          })
        } catch {
          result.failed++
          resolve()
        }
      })
    }

    try {
      // Process in waves of WAVE_SIZE concurrent connections
      for (let i = 0; i < stressTestCount; i += WAVE_SIZE) {
        const wavePromises: Promise<void>[] = []
        const waveEnd = Math.min(i + WAVE_SIZE, stressTestCount)

        for (let j = i; j < waveEnd; j++) {
          wavePromises.push(simulateStudent(j))
        }

        await Promise.all(wavePromises)
      }

      result.durationMs = Date.now() - startTime
      result.votesPerSecond = result.durationMs > 0 ? Math.round((result.voted / result.durationMs) * 1000) : 0

      setStressTestResult(result)
      toast.success(`Stress test concluido! ${result.voted} votos em ${(result.durationMs / 1000).toFixed(1)}s`)
    } catch (err) {
      result.durationMs = Date.now() - startTime
      result.errors.push(`Erro fatal: ${err instanceof Error ? err.message : 'Desconhecido'}`)
      setStressTestResult(result)
      toast.error('Erro durante o stress test.')
    } finally {
      setStressTestRunning(false)
    }
  }

  const handleShowQr = () => {
    const newVisible = !showQrOnPresentation
    setShowQrOnPresentation(newVisible)
    socket?.emit('show-qr', {
      sessionCode: selectedSession?.code,
      visible: newVisible,
    })
  }

  const handleSelectQuestion = async (questionId: string) => {
    if (isNavigating || !selectedSession) return
    setIsNavigating(true)
    const q = selectedSession.questions.find((q) => q.id === questionId)
    setCurrentQuestionId(questionId)
    setRevealed(q?.isRevealed ?? false)
    setVoteResults({ A: 0, B: 0, C: 0, D: 0, E: 0, total: 0 })
    await updateSession({ currentQuestionId: questionId })
    socket?.emit('activate-question', {
      sessionCode: selectedSession.code,
      questionId,
    })
    setTimeout(() => setIsNavigating(false), 300)
  }

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return dateStr
    }
  }

  const totalVotes = voteResults.total || ALT_LABELS.reduce((sum, alt) => sum + (voteResults[alt] ?? 0), 0)

  // ── LOGIN SCREEN ─────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#00338C] via-[#001d52] to-[#050A1A] p-4">
        <Card className="w-full max-w-md shadow-2xl border-0">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-3 flex size-16 items-center justify-center rounded-full bg-[#00338C]">
              <Lock className="size-8 text-white" />
            </div>
            <CardTitle className="text-2xl font-bold text-[#00338C]">
              ENADE Quiz — Admin
            </CardTitle>
            <CardDescription>
              Digite a senha para acessar o painel administrativo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Digite a senha de acesso"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setAuthError('')
                  }}
                  autoFocus
                />
                {authError && (
                  <p className="text-sm text-destructive">{authError}</p>
                )}
              </div>
              <Button
                type="submit"
                disabled={authLoading}
                className="w-full bg-[#00338C] hover:bg-[#00338C]/90 text-white"
              >
                {authLoading && <Loader2 className="size-4 animate-spin" />}
                Entrar
              </Button>
            </form>
          </CardContent>
        </Card>
        <footer className="mt-auto pt-8 text-center text-xs text-[#3A4A7E]">
          <div className="flex items-center justify-center gap-2">
            <img src="/logo.svg" alt="UEMS" className="h-4 w-4 object-contain opacity-50" />
            <span>UEMS / DIGES — Sistema ENADE Quiz</span>
          </div>
        </footer>
      </div>
    )
  }

  // ── SESSION MANAGEMENT VIEW ──────────────────────────────────
  if (managingSession && selectedSession) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-[#050A1A]">
        {/* Header */}
        <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:bg-[#0D1B3E]/95">
          <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setManagingSession(false)
                fetchSessions()
              }}
            >
              <ChevronLeft className="size-4" />
              Voltar
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="truncate text-sm font-semibold text-foreground">
                {selectedSession.title}
              </h1>
              <p className="text-xs text-muted-foreground">
                Código: {selectedSession.code}
              </p>
            </div>
            <StatusBadge status={selectedSession.status} />
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                window.open(`/apresentacao/${selectedSession.code}`, '_blank')
              }
              className="border-[#C8A84B] text-[#C8A84B] hover:bg-[#C8A84B]/10"
            >
              <ExternalLink className="size-3.5" />
              Abrir Apresentação
            </Button>
          </div>
        </header>

        <main className="flex-1 mx-auto w-full max-w-5xl p-4 sm:p-6">
          {/* Tabbed Interface */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="questoes" className="gap-1.5">
                <Settings2 className="size-3.5" />
                Questões
              </TabsTrigger>
              <TabsTrigger value="apresentar" className="gap-1.5">
                <Monitor className="size-3.5" />
                Apresentar
              </TabsTrigger>
            </TabsList>

            {/* ═══ TAB 1: QUESTÕES ═══ */}
            <TabsContent value="questoes">
              {/* Session Info Card */}
              <Card className="mb-6">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Informações da Sessão</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Código</p>
                      <div className="flex items-center gap-1">
                        <p className="font-mono font-bold text-[#00338C] dark:text-[#C8A84B]">
                          {selectedSession.code}
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6"
                          onClick={() => {
                            navigator.clipboard.writeText(selectedSession.code)
                            toast.success('Código copiado!')
                          }}
                        >
                          <Copy className="size-3" />
                        </Button>
                      </div>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Título</p>
                      <p className="font-medium truncate">{selectedSession.title}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Questões</p>
                      <p className="font-medium">{selectedSession.questions.length}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Criada em</p>
                      <p className="font-medium">{formatDate(selectedSession.createdAt)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Questions Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                <h2 className="text-lg font-semibold">
                  Questões ({selectedSession.questions.length})
                </h2>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setImportJsonOpen(true)}
                  >
                    <FileJson className="size-3.5" />
                    Importar JSON
                  </Button>
                  <Button
                    size="sm"
                    className="bg-[#00338C] hover:bg-[#00338C]/90 text-white"
                    onClick={() => {
                      setEditingQuestion(null)
                      setQuestionFormOpen(true)
                    }}
                  >
                    <Plus className="size-3.5" />
                    Adicionar Questão
                  </Button>
                </div>
              </div>

              {/* Questions List with DnD */}
              {selectedSession.questions.length === 0 ? (
                <Card className="py-12">
                  <div className="text-center text-muted-foreground">
                    <p className="text-lg font-medium">Nenhuma questão</p>
                    <p className="text-sm mt-1">
                      Adicione questões manualmente ou importe via JSON.
                    </p>
                  </div>
                </Card>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={selectedSession.questions.map((q) => q.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="grid gap-2">
                      {selectedSession.questions.map((q, i) => (
                        <SortableQuestionItem
                          key={q.id}
                          question={q}
                          index={i}
                          onEdit={(question) => {
                            setEditingQuestion(question)
                            setQuestionFormOpen(true)
                          }}
                          onDelete={(id) => setDeleteQuestionId(id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </TabsContent>

            {/* ═══ TAB 2: APRESENTAR ═══ */}
            <TabsContent value="apresentar">
              <div className="grid gap-6">
                {/* Row 1: Presentation Preview (at the top for better visibility) */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">Preview da Apresentação</CardTitle>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          window.open(`/apresentacao/${selectedSession.code}`, '_blank')
                        }
                        className="border-[#C8A84B] text-[#C8A84B] hover:bg-[#C8A84B]/10"
                      >
                        <Monitor className="size-4" />
                        Abrir Tela Cheia
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="w-full rounded-xl overflow-hidden border border-[#1A2A5E] bg-[#050A1A]" style={{ aspectRatio: '16/9' }}>
                      <iframe
                        src={`/apresentacao/${selectedSession.code}`}
                        className="w-full h-full border-0"
                        title="Preview da Apresentação"
                        style={{ transformOrigin: 'top left' }}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Row 2: Session Status + Participant Counter */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Session Status Card */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        Status da Sessão
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-3 mb-4">
                        <StatusBadge status={selectedSession.status} />
                        <span className="text-sm text-muted-foreground">
                          {selectedSession.status === 'waiting' && 'Pronta para iniciar'}
                          {selectedSession.status === 'active' && 'Em andamento'}
                          {selectedSession.status === 'finished' && 'Encerrada'}
                        </span>
                      </div>
                      <div className="flex flex-col gap-2">
                        {selectedSession.status === 'waiting' && (
                          <>
                            <Button
                              onClick={handleStartSession}
                              disabled={selectedSession.questions.length === 0}
                              className="bg-green-600 hover:bg-green-700 text-white h-12 text-base font-semibold shadow-lg shadow-green-600/20"
                            >
                              <PlayCircle className="size-5" />
                              Iniciar Apresentacao
                            </Button>
                            {selectedSession.questions.length === 0 && (
                              <p className="text-xs text-destructive">Adicione questões antes de iniciar</p>
                            )}
                          </>
                        )}
                        {selectedSession.status === 'active' && (
                          <div className="flex gap-2">
                            <Button
                              onClick={handleEndSession}
                              variant="destructive"
                              className="h-10"
                            >
                              <StopCircle className="size-4" />
                              Encerrar Sessão
                            </Button>
                            <Button
                              onClick={handleShowQr}
                              variant={showQrOnPresentation ? 'default' : 'outline'}
                              className={showQrOnPresentation
                                ? 'bg-[#C8A84B] hover:bg-[#B8983B] text-[#050A1A] h-10'
                                : 'border-[#C8A84B] text-[#C8A84B] hover:bg-[#C8A84B]/10 h-10'
                              }
                            >
                              <Monitor className="size-4" />
                              {showQrOnPresentation ? 'Ocultar QR Code' : 'Mostrar QR Code'}
                            </Button>
                          </div>
                        )}
                        {selectedSession.status === 'finished' && (
                          <Button
                            onClick={() => setResetConfirmOpen(true)}
                            className="bg-amber-600 hover:bg-amber-700 text-white h-10"
                          >
                            Resetar Sessao
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Participant Counter Card */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Users className="size-4 text-[#C8A84B]" />
                        Participantes Conectados
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-4xl font-bold text-[#00338C] dark:text-[#C8A84B]">
                          {participantCount}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {participantCount === 1 ? 'participante' : 'participantes'}
                        </span>
                      </div>
                      <Button
                        onClick={() => {
                          setStressTestResult(null)
                          setStressTestOpen(true)
                        }}
                        disabled={!currentQuestionId || selectedSession.status !== 'active'}
                        className="w-full bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white h-10 font-semibold shadow-lg shadow-red-600/20"
                      >
                        <Zap className="size-4" />
                        Stress Test ({stressTestCount} alunos)
                      </Button>
                      {!currentQuestionId && selectedSession.status === 'active' && (
                        <p className="text-xs text-muted-foreground mt-1">Selecione uma questão primeiro</p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Row 2: Current Question Controls */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Controles da Questão Atual</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      {/* Previous */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePrevious}
                        disabled={!hasPrev || isNavigating}
                      >
                        <ChevronLeft className="size-4" />
                        Anterior
                      </Button>

                      {/* Next */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleNext}
                        disabled={!hasNext || isNavigating}
                      >
                        Próxima
                        <ChevronRight className="size-4" />
                      </Button>

                      {/* Pause / Resume */}
                      <Button
                        size="sm"
                        variant={votingPaused ? 'outline' : 'default'}
                        onClick={handleToggleVoting}
                        disabled={!currentQuestion || revealed}
                        className={
                          votingPaused
                            ? 'border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'
                            : 'bg-amber-500 hover:bg-amber-600 text-white'
                        }
                      >
                        {votingPaused ? (
                          <>
                            <Play className="size-4" />
                            Retomar Votação
                          </>
                        ) : (
                          <>
                            <Pause className="size-4" />
                            Pausar Votação
                          </>
                        )}
                      </Button>

                      {/* Reveal Answer */}
                      <Button
                        size="sm"
                        onClick={handleRevealAnswer}
                        disabled={!currentQuestion || revealed}
                        className="bg-[#C8A84B] hover:bg-[#C8A84B]/90 text-white"
                      >
                        <KeyRound className="size-4" />
                        Revelar Gabarito
                      </Button>

                      {/* Winners */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleGetRanking}
                        className="border-[#C8A84B] text-[#C8A84B] hover:bg-[#C8A84B]/10"
                      >
                        <Trophy className="size-4" />
                        Vencedores
                      </Button>
                    </div>

                    {/* Question selector pills */}
                    {selectedSession.questions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedSession.questions.map((q, idx) => (
                          <button
                            key={q.id}
                            onClick={() => handleSelectQuestion(q.id)}
                            className={`px-3 py-1 rounded-md text-xs font-medium ${
                              q.id === currentQuestionId
                                ? 'bg-[#00338C] text-white'
                                : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                            } ${q.isRevealed ? 'ring-1 ring-[#C8A84B]' : ''}`}
                          >
                            Q{idx + 1}
                          </button>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Row 3: Current Question Preview + Live Results */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Current Question Preview */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">
                        Questão Atual
                        {currentQuestion && (
                          <span className="ml-2 text-sm font-normal text-muted-foreground">
                            ({currentIndex + 1}/{totalQuestions})
                          </span>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {!currentQuestion ? (
                        <div className="py-8 text-center text-muted-foreground">
                          <p>Nenhuma questão selecionada</p>
                          <p className="text-sm mt-1">Clique em uma questão acima ou use a navegação</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {currentQuestion.imageUrl && (
                            <img
                              src={currentQuestion.imageUrl}
                              alt="Imagem da questão"
                              className="max-h-40 rounded-lg border object-contain"
                            />
                          )}
                          <p className="text-sm leading-relaxed">
                            {currentQuestion.text}
                          </p>
                          <div className="grid gap-1.5">
                            {ALT_LABELS.map((alt) => {
                              const altKey = `alt${alt}` as 'altA' | 'altB' | 'altC' | 'altD' | 'altE'
                              const isCorrect = revealed && currentQuestion.correctAnswer === alt
                              return (
                                <div
                                  key={alt}
                                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm ${
                                    isCorrect
                                      ? 'bg-green-100 dark:bg-green-900/20 border border-green-300 dark:border-green-700'
                                      : revealed
                                      ? 'opacity-40'
                                      : 'bg-muted/50'
                                  }`}
                                >
                                  <span className="flex size-5 items-center justify-center rounded bg-[#00338C] text-[10px] font-bold text-white shrink-0">
                                    {alt}
                                  </span>
                                  <span className="truncate">{currentQuestion[altKey]}</span>
                                  {isCorrect && (
                                    <span className="ml-auto text-xs font-bold text-green-600 dark:text-green-400">
                                      ✓ Gabarito
                                    </span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                          {revealed && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-[#C8A84B]/10 border border-[#C8A84B]/30">
                              <KeyRound className="size-4 text-[#C8A84B]" />
                              <span className="text-sm font-bold text-[#C8A84B]">
                                Gabarito: {currentQuestion.correctAnswer}
                              </span>
                            </div>
                          )}
                          {votingPaused && !revealed && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-100 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700">
                              <Pause className="size-4 text-amber-600 dark:text-amber-400" />
                              <span className="text-sm font-bold text-amber-600 dark:text-amber-400">
                                Votação pausada
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Live Results (CSS Bar Chart) */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        Resultados em Tempo Real
                        <Badge variant="secondary" className="text-xs">
                          {totalVotes} {totalVotes === 1 ? 'voto' : 'votos'}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {!currentQuestion ? (
                        <div className="py-8 text-center text-muted-foreground">
                          <p>Selecione uma questão para ver os resultados</p>
                        </div>
                      ) : totalVotes > 0 ? (
                        <div className="space-y-2">
                          {ALT_LABELS.map((alt) => {
                            const votes = voteResults[alt] ?? 0
                            const pct = totalVotes > 0 ? (votes / totalVotes) * 100 : 0
                            const isCorrect = revealed && currentQuestion?.correctAnswer === alt
                            return (
                              <div
                                key={alt}
                                className={`flex items-center gap-2 ${revealed && !isCorrect ? 'opacity-35' : ''}`}
                              >
                                <span
                                  className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold text-white shrink-0"
                                  style={{ backgroundColor: CHART_COLORS[alt] }}
                                >
                                  {alt}
                                </span>
                                <div className="flex-1 h-7 bg-muted/50 rounded-full overflow-hidden relative">
                                  <div
                                    className="h-full rounded-full"
                                    style={{
                                      width: `${pct}%`,
                                      backgroundColor: CHART_COLORS[alt],
                                      minWidth: votes > 0 ? '2rem' : '0',
                                    }}
                                  />
                                  {votes > 0 && (
                                    <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white drop-shadow-sm">
                                      {pct.toFixed(0)}%
                                    </span>
                                  )}
                                </div>
                                <span className="text-sm text-muted-foreground w-12 text-right shrink-0">
                                  {votes} {votes === 1 ? 'voto' : 'votos'}
                                </span>
                                {isCorrect && (
                                  <span className="text-xs font-bold text-[#C8A84B] shrink-0">✓</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="py-8 text-center text-muted-foreground">
                          <div className="w-20 h-20 mx-auto rounded-full border-4 border-dashed border-muted flex items-center justify-center">
                            <span className="text-sm">Sem votos</span>
                          </div>
                          <p className="text-sm mt-2">Aguardando votos...</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </main>

        <footer className="mt-auto border-t border-[#1A2A5E] bg-[#0A1128] py-3 text-center text-xs text-[#3A4A7E]">
          <div className="flex items-center justify-center gap-2">
            <img src="/logo.svg" alt="UEMS" className="h-4 w-4 object-contain opacity-50" />
            <span>UEMS / DIGES — Sistema ENADE Quiz</span>
          </div>
        </footer>

        {/* Question Form Dialog */}
        <QuestionFormDialog
          open={questionFormOpen}
          onOpenChange={setQuestionFormOpen}
          question={editingQuestion}
          sessionId={selectedSession.id}
          sessionCode={selectedSession.code}
          onSave={refreshSession}
        />

        {/* Import JSON Dialog */}
        <ImportJsonDialog
          open={importJsonOpen}
          onOpenChange={setImportJsonOpen}
          sessionCode={selectedSession.code}
          onImport={refreshSession}
        />

        {/* Delete Question Confirmation */}
        <AlertDialog
          open={!!deleteQuestionId}
          onOpenChange={(open) => !open && setDeleteQuestionId(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir Questão</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir esta questão? Esta ação não pode
                ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteQuestion}
                disabled={deleting}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                {deleting && <Loader2 className="size-4 animate-spin" />}
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Vencedores Dialog */}
        <VencedoresDialog
          open={showRanking}
          onOpenChange={setShowRanking}
          ranking={ranking}
          totalQuestions={totalQuestions}
        />

        {/* Reset Session Confirmation */}
        <AlertDialog
          open={resetConfirmOpen}
          onOpenChange={setResetConfirmOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Resetar Sessão</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja resetar a sessão? Todos os votos serão apagados, as questões serão desmarcadas e a sessão voltará ao estado &quot;Aguardando&quot;. Os participantes conectados serão notificados.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleResetSession}
                className="bg-amber-600 text-white hover:bg-amber-700"
              >
                Resetar Sessao
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Stress Test Dialog */}
        <Dialog open={stressTestOpen} onOpenChange={setStressTestOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Zap className="size-5 text-red-500" />
                Stress Test — Simulação de Acesso
              </DialogTitle>
              <DialogDescription>
                Simule o acesso simultâneo de múltiplos alunos respondendo à questão atual.
                Isso enviará votos reais via Socket.io para testar a capacidade do servidor.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              {/* Config */}
              <div className="grid gap-3">
                <div className="grid gap-2">
                  <Label>Número de Alunos Simulados</Label>
                  <div className="flex gap-2">
                    {[100, 500, 1000, 2000].map((count) => (
                      <Button
                        key={count}
                        size="sm"
                        variant={stressTestCount === count ? 'default' : 'outline'}
                        onClick={() => setStressTestCount(count)}
                        className={stressTestCount === count ? 'bg-red-600 hover:bg-red-700 text-white' : ''}
                      >
                        {count}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <Activity className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    <strong>Questão ativa:</strong> {currentQuestion ? `Q${currentIndex + 1} — ${currentQuestion.text.slice(0, 80)}...` : 'Nenhuma questão selecionada'}
                  </p>
                </div>
              </div>

              {/* Running indicator */}
              {stressTestRunning && (
                <div className="flex flex-col items-center gap-3 py-6">
                  <div className="relative">
                    <div className="size-16 rounded-full border-4 border-red-200 dark:border-red-900" />
                    <div className="absolute inset-0 size-16 rounded-full border-4 border-red-500 border-t-transparent animate-spin" />
                    <Zap className="absolute inset-0 m-auto size-6 text-red-500" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-lg">Simulando {stressTestCount} alunos...</p>
                    <p className="text-sm text-muted-foreground">Conectando e enviando votos</p>
                  </div>
                </div>
              )}

              {/* Results */}
              {stressTestResult && !stressTestRunning && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                      <p className="text-xs text-green-600 dark:text-green-400">Conectados</p>
                      <p className="text-2xl font-bold text-green-700 dark:text-green-300">{stressTestResult.connected}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                      <p className="text-xs text-blue-600 dark:text-blue-400">Votos Enviados</p>
                      <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{stressTestResult.voted}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                      <p className="text-xs text-red-600 dark:text-red-400">Falhas</p>
                      <p className="text-2xl font-bold text-red-700 dark:text-red-300">{stressTestResult.failed}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                      <p className="text-xs text-purple-600 dark:text-purple-400">Votos/segundo</p>
                      <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{stressTestResult.votesPerSecond}</p>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-muted/50 border">
                    <p className="text-xs text-muted-foreground mb-1">Tempo total</p>
                    <p className="font-semibold">{(stressTestResult.durationMs / 1000).toFixed(2)}s</p>
                  </div>

                  {/* Vote distribution */}
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Distribuição dos Votos</p>
                    {ALT_LABELS.map((alt) => {
                      const votes = stressTestResult.voteDistribution[alt] ?? 0
                      const maxVotes = Math.max(...ALT_LABELS.map((a) => stressTestResult.voteDistribution[a] ?? 0), 1)
                      const pct = (votes / maxVotes) * 100
                      const isCorrect = currentQuestion?.correctAnswer === alt
                      return (
                        <div key={alt} className={`flex items-center gap-2 ${isCorrect ? '' : 'opacity-60'}`}>
                          <span
                            className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                            style={{ backgroundColor: CHART_COLORS[alt] }}
                          >
                            {alt}
                          </span>
                          <div className="flex-1 h-5 bg-muted/50 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: CHART_COLORS[alt],
                              }}
                            />
                          </div>
                          <span className="text-xs font-medium w-14 text-right shrink-0">
                            {votes} votos
                          </span>
                          {isCorrect && (
                            <span className="text-[10px] font-bold text-[#C8A84B] shrink-0">✓</span>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {stressTestResult.errors.length > 0 && (
                    <div className="p-2 rounded bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800">
                      <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">Erros:</p>
                      {stressTestResult.errors.slice(0, 5).map((err, i) => (
                        <p key={i} className="text-xs text-red-500 dark:text-red-300">{err}</p>
                      ))}
                      {stressTestResult.errors.length > 5 && (
                        <p className="text-xs text-red-400">...e mais {stressTestResult.errors.length - 5} erros</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setStressTestOpen(false)}
                disabled={stressTestRunning}
              >
                Fechar
              </Button>
              <Button
                onClick={handleStressTest}
                disabled={stressTestRunning || !currentQuestionId}
                className="bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white"
              >
                {stressTestRunning ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Executando...
                  </>
                ) : (
                  <>
                    <Zap className="size-4" />
                    Iniciar Stress Test
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // ── ADMIN DASHBOARD ──────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-[#050A1A]">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:bg-[#0D1B3E]/95">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="UEMS" className="size-8 object-contain rounded-md bg-[#00338C] p-1" />
            <div>
              <h1 className="text-sm font-bold text-foreground leading-none">
                ENADE Quiz
              </h1>
              <p className="text-[10px] text-muted-foreground leading-none mt-0.5">
                Painel Administrativo
              </p>
            </div>
          </div>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={handleLogout}>
            <LogOut className="size-3.5" />
            Sair
          </Button>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-5xl p-4 sm:p-6">
        {/* Page title row */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Sessões</h2>
            <p className="text-sm text-muted-foreground">
              Gerencie as sessões de quiz do ENADE
            </p>
          </div>
          <Button
            className="bg-[#00338C] hover:bg-[#00338C]/90 text-white"
            onClick={() => {
              setNewTitle('')
              setNewSessionOpen(true)
            }}
          >
            <Plus className="size-4" />
            Nova Sessão
          </Button>
        </div>

        {/* Sessions list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-8 animate-spin text-[#00338C]" />
          </div>
        ) : sessions.length === 0 ? (
          <Card className="py-16">
            <div className="text-center text-muted-foreground">
              <p className="text-lg font-medium">Nenhuma sessão encontrada</p>
              <p className="text-sm mt-1">
                Crie uma nova sessão para começar.
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid gap-3">
            {sessions.map((session) => (
              <Card
                key={session.id}
                className="overflow-hidden"
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    {/* Session info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono font-bold text-sm text-[#00338C] dark:text-[#C8A84B]">
                          {session.code}
                        </span>
                        <StatusBadge status={session.status} />
                      </div>
                      <h3 className="font-semibold text-foreground truncate">
                        {session.title}
                      </h3>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>{session.questions.length} questão(ões)</span>
                        <span>&middot;</span>
                        <span>{formatDate(session.createdAt)}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 sm:flex-none border-[#C8A84B] text-[#C8A84B] hover:bg-[#C8A84B]/10"
                        onClick={() =>
                          window.open(
                            `/apresentacao/${session.code}`,
                            '_blank'
                          )
                        }
                      >
                        <ExternalLink className="size-3.5" />
                        <span className="sm:hidden">Apresentação</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 sm:flex-none"
                        onClick={() => openSessionManagement(session)}
                      >
                        <Settings2 className="size-3.5" />
                        <span className="sm:hidden">Gerenciar</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 sm:flex-none border-[#00338C]/30 text-[#00338C] dark:text-[#2196F3] hover:bg-[#00338C]/10 dark:hover:bg-[#2196F3]/10"
                        onClick={() => handleDuplicateSession(session.code)}
                        title="Duplicar sessão"
                      >
                        <Copy className="size-3.5" />
                        <span className="sm:hidden">Duplicar</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 sm:flex-none text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60 hover:bg-destructive/10"
                        onClick={() => setDeleteSessionCode(session.code)}
                      >
                        <Trash2 className="size-3.5" />
                        <span className="sm:hidden">Excluir</span>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <footer className="mt-auto border-t border-[#1A2A5E] bg-[#0A1128] py-3 text-center text-xs text-[#3A4A7E]">
        <div className="flex items-center justify-center gap-2">
          <img src="/logo.svg" alt="UEMS" className="h-4 w-4 object-contain opacity-50" />
          <span>UEMS / DIGES — Sistema ENADE Quiz</span>
        </div>
      </footer>

      {/* New Session Dialog */}
      <Dialog open={newSessionOpen} onOpenChange={setNewSessionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Sessão</DialogTitle>
            <DialogDescription>
              Crie uma nova sessão de quiz para o ENADE.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="session-title">Título da Sessão *</Label>
              <Input
                id="session-title"
                placeholder="Ex: Simulado ENADE 2025 — Administração"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateSession()
                }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setNewSessionOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateSession}
              disabled={creatingSession}
              className="bg-[#00338C] hover:bg-[#00338C]/90 text-white"
            >
              {creatingSession && <Loader2 className="size-4 animate-spin" />}
              Criar Sessão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Session Confirmation */}
      <AlertDialog
        open={!!deleteSessionCode}
        onOpenChange={(open) => !open && setDeleteSessionCode(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Sessão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta sessão? Todas as questões e
              votos serão perdidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSession}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
