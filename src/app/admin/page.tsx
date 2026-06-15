'use client'

import React, { useState, useEffect, useCallback } from 'react'
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
import { ScrollArea } from '@/components/ui/scroll-area'
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
  Copy,
} from 'lucide-react'
import type { Session, Question, SessionStatus } from '@/types'
import { UEMS_COURSES } from '@/types'

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
      className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
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
  const [saving, setSaving] = useState(false)

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
      }
    }
  }, [open, question])

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
            disabled={saving}
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

  // Question form
  const [questionFormOpen, setQuestionFormOpen] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null)

  // Import JSON
  const [importJsonOpen, setImportJsonOpen] = useState(false)

  // Delete confirmation
  const [deleteSessionCode, setDeleteSessionCode] = useState<string | null>(null)
  const [deleteQuestionId, setDeleteQuestionId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

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
        <footer className="mt-auto pt-8 text-center text-xs text-white/40">
          UEMS / DIGES — Sistema ENADE Quiz
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
        </main>

        <footer className="mt-auto border-t bg-white dark:bg-[#0D1B3E] py-3 text-center text-xs text-muted-foreground">
          UEMS / DIGES — Sistema ENADE Quiz
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
            <div className="flex size-8 items-center justify-center rounded-md bg-[#00338C]">
              <span className="text-xs font-bold text-white">EQ</span>
            </div>
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
                className="overflow-hidden transition-shadow hover:shadow-md"
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

      <footer className="mt-auto border-t bg-white dark:bg-[#0D1B3E] py-3 text-center text-xs text-muted-foreground">
        UEMS / DIGES — Sistema ENADE Quiz
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
