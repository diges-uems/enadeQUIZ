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
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
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
  Library,
  Search,
  Download,
  CheckSquare,
} from 'lucide-react'
import type { Session, Question, SessionStatus } from '@/types'
import { UEMS_COURSES, CHART_COLORS } from '@/types'
import { QuestionText, getActiveAlternatives } from '@/components/QuestionText'

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

// ─── Admin auth token storage ───────────────────────────────────────
// Stored in localStorage (per the security hardening spec) so the token
// survives page reloads / new tabs during a long presentation. The
// previous sessionStorage-based approach required re-login on every
// tab open, which was annoying for operators.
const ADMIN_TOKEN_KEY = 'enade_admin_token'

/** Read the stored admin token (or null). */
export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(ADMIN_TOKEN_KEY)
  } catch {
    return null
  }
}

/** Persist the admin token. */
function setAdminToken(token: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(ADMIN_TOKEN_KEY, token)
  } catch {
    /* storage may be disabled — best-effort */
  }
}

/** Clear the admin token. */
function clearAdminToken(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(ADMIN_TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Event dispatched on window when an admin fetch returns 401. The main
 * AdminPage component listens for this and bounces back to the login
 * screen. This indirection is needed because nested dialog components
 * (QuestionForm, ImportJsonDialog, ...) also call adminFetch but don't
 * have direct access to the page-level setIsAuthenticated state.
 */
export const ADMIN_LOGOUT_EVENT = 'enade-admin-logout'

/**
 * Authenticated fetch helper.
 *
 * Adds the `x-admin-token` header from localStorage and, on a 401
 * response, clears the token + dispatches the ADMIN_LOGOUT_EVENT so
 * the main page can redirect to the login screen.
 *
 * Signature matches `fetch` — drop-in replacement.
 */
export async function adminFetch(
  input: string | URL | Request,
  init: RequestInit = {}
): Promise<Response> {
  const token = getAdminToken()
  const headers = new Headers(init.headers || {})
  if (token) {
    headers.set('x-admin-token', token)
  }
  // Ensure JSON content-type is set for requests with a body but no
  // explicit content-type (most callers forget this — the server needs
  // it to parse the body via isSafeJsonBody, though NextRequest.json
  // is forgiving, our isSafeJsonBody reads Content-Length so the body
  // is parsed regardless).
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(input, { ...init, headers })

  if (res.status === 401) {
    // Token is missing or invalid — clear it and notify the page.
    clearAdminToken()
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(ADMIN_LOGOUT_EVENT))
    }
  }
  return res
}

// ─── Bank Question Type ─────────────────────────────────────────────
interface BankQuestion {
  id: string
  title: string
  text?: string
  year?: number | null
  course?: string | null
  correctAnswer: string
  category?: string | null
  tags?: string | null
  altA: string
  altB: string
  altC: string
  altD: string
  altE?: string | null
  imageUrl?: string | null
  createdAt: string
}

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
        <p className="text-sm line-clamp-2 text-foreground whitespace-pre-line">
          {question.text}
        </p>
        <div className="flex items-center gap-1 mt-1">
          {getActiveAlternatives(question).map((alt) => (
            <span key={alt} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {alt}
            </span>
          ))}
        </div>
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

      const res = await adminFetch('/api/upload', {
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
    if (!text.trim() || !altA.trim() || !altB.trim() || !altC.trim() || !altD.trim()) {
      toast.error('Preencha todos os campos obrigatórios (A-D).')
      return
    }

    setSaving(true)
    try {
      if (isEditing && question) {
        const res = await adminFetch(
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
        const res = await adminFetch(`/api/session/${sessionCode}/questions`, {
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
            <Label>Alternativas * <span className="text-xs font-normal text-muted-foreground">(A-D obrigatórias, E opcional)</span></Label>
            {[
              { letter: 'A', value: altA, setter: setAltA, required: true },
              { letter: 'B', value: altB, setter: setAltB, required: true },
              { letter: 'C', value: altC, setter: setAltC, required: true },
              { letter: 'D', value: altD, setter: setAltD, required: true },
              { letter: 'E', value: altE, setter: setAltE, required: false },
            ].map(({ letter, value, setter, required }) => (
              <div key={letter} className="flex items-center gap-2">
                <span className={`flex size-7 items-center justify-center rounded text-xs font-bold text-white shrink-0 ${required ? 'bg-[#00338C]' : 'bg-[#3A4A7E]'}`}>
                  {letter}
                </span>
                <Input
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  placeholder={`Alternativa ${letter}${!required ? ' (opcional)' : ''}`}
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
      const res = await adminFetch(`/api/session/${sessionCode}/questions`, {
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
  const [socketConnected, setSocketConnected] = useState(false)
  const [socketReconnecting, setSocketReconnecting] = useState(false)
  const [participantCount, setParticipantCount] = useState(0)
  const [totalParticipants, setTotalParticipants] = useState(0)
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

  // Question Bank state
  const [bankQuestions, setBankQuestions] = useState<BankQuestion[]>([])
  const [bankCategories, setBankCategories] = useState<string[]>([])
  const [bankCourses, setBankCourses] = useState<string[]>([])
  const [selectedBankIds, setSelectedBankIds] = useState<Set<string>>(new Set())
  const [showCreateBankDialog, setShowCreateBankDialog] = useState(false)
  const [showImportBankDialog, setShowImportBankDialog] = useState(false)
  const [bankLoading, setBankLoading] = useState(false)
  const [bankFilterCategory, setBankFilterCategory] = useState<string>('all')
  const [bankFilterCourse, setBankFilterCourse] = useState<string>('all')
  const [bankSearch, setBankSearch] = useState('')
  // Create question form
  const [bankForm, setBankForm] = useState({
    title: '', text: '', year: '', course: '', altA: '', altB: '', altC: '', altD: '', altE: '',
    correctAnswer: 'A', category: '', tags: '', imageUrl: '',
  })
  const [creatingBankQuestion, setCreatingBankQuestion] = useState(false)
  // Import to session
  const [importTargetSession, setImportTargetSession] = useState<string>('')
  const [importingBank, setImportingBank] = useState(false)
  // Delete bank question
  const [deleteBankQuestionId, setDeleteBankQuestionId] = useState<string | null>(null)

  // Stress test state
  const [stressTestOpen, setStressTestOpen] = useState(false)
  const [stressTestRunning, setStressTestRunning] = useState(false)
  const [stressTestCount, setStressTestCount] = useState(1000)
  const [stressTestScenario, setStressTestScenario] = useState<
    'normal' | 'flood' | 'bad-presenter' | 'bad-input' | 'long-lived' | 'mixed'
  >('normal')
  const [stressTestElapsed, setStressTestElapsed] = useState(0)
  const [stressTestResult, setStressTestResult] = useState<{
    scenario?: string
    totalStudents: number
    connected: number
    voted: number
    failed: number
    durationMs: number
    votesPerSecond: number
    voteDistribution: { A: number; B: number; C: number; D: number; E: number }
    rejectedVotes?: number
    presenterBlocked?: number
    badInputBlocked?: number
    peakConcurrentConnections?: number
    avgResponseTimeMs?: number
    memoryRssMb?: number
    dryRun?: boolean
    timedOut?: boolean
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

  // Check auth on mount — read from localStorage so the session
  // survives page reloads / new tabs during a long presentation.
  useEffect(() => {
    const token = getAdminToken()
    if (token) setIsAuthenticated(true)
  }, [])

  // Listen for forced-logout events from adminFetch (any admin-only
  // route returning 401 will dispatch this). Bounces back to login.
  useEffect(() => {
    const handler = () => {
      clearAdminToken()
      setIsAuthenticated(false)
      setSelectedSession(null)
      setManagingSession(false)
      setPassword('')
      setAuthError('Sessão expirada. Faça login novamente.')
      toast.error('Sessão expirada. Faça login novamente.')
    }
    window.addEventListener(ADMIN_LOGOUT_EVENT, handler)
    return () => window.removeEventListener(ADMIN_LOGOUT_EVENT, handler)
  }, [])

  // Fetch question bank when banco tab is active
  const fetchBankQuestions = useCallback(async () => {
    setBankLoading(true)
    try {
      const res = await fetch('/api/question-bank')
      if (res.ok) {
        const data = await res.json()
        // API returns tags as string, ensure type compatibility
        setBankQuestions((data.questions || []).map((q: Record<string, unknown>) => ({
          ...q,
          tags: typeof q.tags === 'string' ? q.tags : (Array.isArray(q.tags) ? q.tags.join(', ') : ''),
        })))
        setBankCategories(data.categories || [])
        setBankCourses(data.courses || [])
      }
    } catch {
      toast.error('Erro ao carregar banco de questões.')
    } finally {
      setBankLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'banco') {
      fetchBankQuestions()
      setSelectedBankIds(new Set())
    }
  }, [activeTab, fetchBankQuestions])

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
        setSocketConnected(false)
        setSocketReconnecting(false)
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
      setSocketConnected(true)
      setSocketReconnecting(false)
      // Re-join session on every connect/reconnect (not just the first one).
      // The socket server may have lost our room membership after a disconnect.
      socketInstance.emit('join-session', {
        sessionCode,
        role: 'presenter',
        presenterKey: 'presenter-default-key-2025',
      })
    })

    socketInstance.on('disconnect', () => {
      setSocketConnected(false)
      // We'll only show "Reconnecting..." once a reconnect attempt begins.
    })

    socketInstance.on('reconnect_attempt', () => {
      setSocketReconnecting(true)
    })

    socketInstance.on('reconnect_error', () => {
      setSocketReconnecting(true)
    })

    socketInstance.on('reconnect', () => {
      setSocketReconnecting(false)
      setSocketConnected(true)
    })

    socketInstance.on('connect_error', () => {
      setSocketConnected(false)
      setSocketReconnecting(true)
    })

    socketInstance.on('presenter-rejected', (data: { reason?: string }) => {
      console.warn('Presenter rejected:', data?.reason)
      toast.error('Falha de autenticação do apresentador. Recarregue a página.')
    })

    socketInstance.on('vote-results', (data: VoteResults) => {
      setVoteResults(data)
    })

    socketInstance.on('participant-count', (data: { live: number; total: number }) => {
      setParticipantCount(data.live)
      setTotalParticipants(data.total)
    })

    socketInstance.on('session-state', (data: {
      participantCount: number
      totalParticipants: number
      currentQuestionId: string | null
      votingPaused: boolean
    }) => {
      setParticipantCount(data.participantCount)
      setTotalParticipants(data.totalParticipants)
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
      setSocketConnected(false)
      setSocketReconnecting(false)
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
        // Persist the secure HMAC-bound token in localStorage so all
        // subsequent admin-only fetches can send it via x-admin-token.
        setAdminToken(data.token)
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
    clearAdminToken()
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
      const res = await adminFetch('/api/session', {
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
      const res = await adminFetch(`/api/session/${deleteSessionCode}`, {
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
      const createRes = await adminFetch('/api/session', {
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
        await adminFetch(`/api/session/${newSession.code}/questions`, {
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
      const res = await adminFetch(
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

  // ── Bank question handlers ───────────────────────────────────
  const handleCreateBankQuestion = async () => {
    if (!bankForm.title || !bankForm.text || !bankForm.altA || !bankForm.altB || !bankForm.altC || !bankForm.altD) {
      toast.error('Preencha os campos obrigatórios: título, texto, alternativas A-D.')
      return
    }
    setCreatingBankQuestion(true)
    try {
      const body: Record<string, unknown> = {
        title: bankForm.title,
        text: bankForm.text,
        year: bankForm.year ? Number(bankForm.year) : null,
        course: bankForm.course || null,
        altA: bankForm.altA,
        altB: bankForm.altB,
        altC: bankForm.altC,
        altD: bankForm.altD,
        altE: bankForm.altE || null,
        correctAnswer: bankForm.correctAnswer,
        category: bankForm.category || null,
        tags: bankForm.tags ? bankForm.tags.split(',').map((t) => t.trim()).filter(Boolean).join(', ') : '',
        imageUrl: bankForm.imageUrl || null,
      }
      const res = await adminFetch('/api/question-bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      toast.success('Questão criada no banco.')
      setShowCreateBankDialog(false)
      setBankForm({
        title: '', text: '', year: '', course: '', altA: '', altB: '', altC: '', altD: '', altE: '',
        correctAnswer: 'A', category: '', tags: '', imageUrl: '',
      })
      fetchBankQuestions()
    } catch {
      toast.error('Erro ao criar questão no banco.')
    } finally {
      setCreatingBankQuestion(false)
    }
  }

  const handleDeleteBankQuestion = async () => {
    if (!deleteBankQuestionId) return
    setDeleting(true)
    try {
      const res = await adminFetch(`/api/question-bank?id=${deleteBankQuestionId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error()
      toast.success('Questão removida do banco.')
      setSelectedBankIds((prev) => {
        const next = new Set(prev)
        next.delete(deleteBankQuestionId)
        return next
      })
      fetchBankQuestions()
    } catch {
      toast.error('Erro ao remover questão do banco.')
    } finally {
      setDeleting(false)
      setDeleteBankQuestionId(null)
    }
  }

  const handleImportToSession = async () => {
    if (selectedBankIds.size === 0) {
      toast.error('Selecione ao menos uma questão.')
      return
    }
    if (!importTargetSession) {
      toast.error('Selecione uma sessão para importar.')
      return
    }
    setImportingBank(true)
    try {
      const res = await adminFetch('/api/question-bank/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionCode: importTargetSession,
          questionIds: Array.from(selectedBankIds),
        }),
      })
      if (!res.ok) throw new Error()
      toast.success(`${selectedBankIds.size} questão(ões) importada(s) com sucesso.`)
      setShowImportBankDialog(false)
      setSelectedBankIds(new Set())
      setImportTargetSession('')
      // Refresh if imported to current session
      if (importTargetSession === selectedSession?.code) {
        refreshSession()
      }
      fetchSessions()
    } catch {
      toast.error('Erro ao importar questões.')
    } finally {
      setImportingBank(false)
    }
  }

  const toggleBankSelection = (id: string) => {
    setSelectedBankIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleAllBankSelection = () => {
    if (selectedBankIds.size === filteredBankQuestions.length) {
      setSelectedBankIds(new Set())
    } else {
      setSelectedBankIds(new Set(filteredBankQuestions.map((q) => q.id)))
    }
  }

  // Filtered bank questions
  const filteredBankQuestions = bankQuestions.filter((q) => {
    if (bankFilterCategory !== 'all' && q.category !== bankFilterCategory) return false
    if (bankFilterCourse !== 'all' && q.course !== bankFilterCourse) return false
    if (bankSearch) {
      const s = bankSearch.toLowerCase()
      const tagsStr = typeof q.tags === 'string' ? q.tags : (Array.isArray(q.tags) ? q.tags.join(', ') : '')
      if (
        !q.title.toLowerCase().includes(s) &&
        !q.category?.toLowerCase().includes(s) &&
        !q.course?.toLowerCase().includes(s) &&
        !tagsStr.toLowerCase().includes(s)
      )
        return false
    }
    return true
  })

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
      await adminFetch(`/api/session/${selectedSession.code}/questions`, {
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
      await adminFetch(`/api/session/${selectedSession.code}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
    } catch (err) {
      console.error('Failed to update session:', err)
    }
  }

  // ── emitWithRetry: reliable socket emit with ack + retry ────────────────
  // - Waits up to 3s for the socket to be connected before attempting.
  // - Emits with a socket.io ack callback so the server can confirm receipt.
  // - Retries up to 3 times on failure (timeout or ok:false).
  // - Shows a toast on persistent failure (toggleable via options.showError).
  // Returns true on success, false on persistent failure.
  const emitWithRetry = useCallback(
    async (
      event: string,
      data: Record<string, unknown>,
      options: { maxRetries?: number; waitConnectionMs?: number; showError?: boolean; failureToast?: string } = {}
    ): Promise<boolean> => {
      const {
        maxRetries = 3,
        waitConnectionMs = 3000,
        showError = true,
        failureToast = 'Comando pode não ter sido recebido. Recarregue a página de apresentação.',
      } = options
      if (!socket) {
        if (showError) toast.error(failureToast)
        return false
      }
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        // Wait for socket to be connected (bounded by waitConnectionMs)
        const waitStart = Date.now()
        while (!socket.connected && Date.now() - waitStart < waitConnectionMs) {
          await new Promise((r) => setTimeout(r, 100))
        }
        if (!socket.connected) {
          if (attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, 400 * attempt))
            continue
          }
          if (showError) toast.error(failureToast)
          return false
        }
        // Emit with ack callback, with a per-attempt timeout
        const ok = await new Promise<boolean>((resolve) => {
          let settled = false
          const ackTimer = setTimeout(() => {
            if (!settled) {
              settled = true
              resolve(false)
            }
          }, waitConnectionMs)
          try {
            socket.emit(event, data, (ack: { ok?: boolean; error?: string } | undefined) => {
              if (!settled) {
                settled = true
                clearTimeout(ackTimer)
                resolve(!!ack?.ok)
              }
            })
          } catch {
            if (!settled) {
              settled = true
              clearTimeout(ackTimer)
              resolve(false)
            }
          }
        })
        if (ok) return true
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 400 * attempt))
        }
      }
      if (showError) toast.error(failureToast)
      return false
    },
    [socket]
  )

  const handleStartSession = async () => {
    if (!selectedSession) return
    await updateSession({ status: 'active' })
    setSelectedSession({ ...selectedSession, status: 'active' })
    await emitWithRetry('activate-question', {
      sessionCode: selectedSession.code,
      questionId: selectedSession.questions[0]?.id,
    }, { failureToast: 'Sessão iniciada no banco, mas a tela de apresentação pode não ter sido notificada. Recarregue a apresentação.' })
    toast.success('Sessão iniciada!')
  }

  const handleEndSession = async () => {
    if (!selectedSession) return
    await updateSession({ status: 'finished' })
    setSelectedSession({ ...selectedSession, status: 'finished' })
    await emitWithRetry('end-session', {
      sessionCode: selectedSession.code,
    }, { failureToast: 'Sessão encerrada no banco, mas a tela de apresentação pode não ter sido notificada. Recarregue a apresentação.' })
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
    await emitWithRetry('activate-question', {
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
    await emitWithRetry('next-question', {
      sessionCode: selectedSession.code,
      questionId: nextQuestion.id,
    })
    setTimeout(() => setIsNavigating(false), 300)
  }

  const handleToggleVoting = () => {
    const newPaused = !votingPaused
    setVotingPaused(newPaused)
    // Fire-and-forget — but still retried for reliability.
    emitWithRetry('toggle-voting', {
      sessionCode: selectedSession?.code,
      paused: newPaused,
    })
  }

  const handleRevealAnswer = async () => {
    if (!currentQuestion || !selectedSession) return
    setRevealed(true)

    // 1) PUT isRevealed: true in the database first.
    try {
      const putRes = await adminFetch(
        `/api/session/${selectedSession.code}/questions/${currentQuestion.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isRevealed: true }),
        }
      )
      if (!putRes.ok) {
        toast.error('Falha ao atualizar o banco de dados. Tente novamente.')
        setRevealed(false)
        return
      }
    } catch (err) {
      console.error('Failed to PUT isRevealed:', err)
      toast.error('Falha ao atualizar o banco de dados. Tente novamente.')
      setRevealed(false)
      return
    }

    // 2) Re-fetch the session to confirm the DB write actually persisted.
    try {
      const refreshRes = await fetch(`/api/session/${selectedSession.code}`)
      if (refreshRes.ok) {
        const fresh: Session = await refreshRes.json()
        const freshQ = fresh.questions?.find((q) => q.id === currentQuestion.id)
        if (freshQ && !freshQ.isRevealed) {
          // DB didn't reflect the change — retry the PUT once.
          console.warn('DB did not reflect isRevealed=true; retrying PUT')
          await adminFetch(
            `/api/session/${selectedSession.code}/questions/${currentQuestion.id}`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ isRevealed: true }),
            }
          )
        }
        // Sync local session state with the refreshed copy
        setSelectedSession(fresh)
      }
    } catch (err) {
      console.error('Failed to re-fetch session after reveal:', err)
    }

    // 3) Emit reveal-answer via socket with ack + retry. If all retries fail,
    //    warn the user that the presentation screen may need a reload.
    const ok = await emitWithRetry('reveal-answer', {
      sessionCode: selectedSession.code,
      questionId: currentQuestion.id,
      correctAnswer: currentQuestion.correctAnswer,
    })
    if (!ok) {
      toast.error('Comando pode não ter sido recebido. Recarregue a página de apresentação.')
    }
  }

  const handleGetRanking = () => {
    // get-ranking returns data via the 'ranking-data' event (no ack needed).
    if (socket?.connected) {
      socket.emit('get-ranking', { sessionCode: selectedSession?.code })
    } else {
      toast.error('Sem conexão com o servidor. Tente novamente.')
    }
    setShowRanking(true)
  }

  const handleResetSession = async () => {
    if (!selectedSession) return
    try {
      const res = await adminFetch(`/api/session/${selectedSession.code}/reset`, { method: 'POST' })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setSelectedSession(data)
      setCurrentQuestionId(null)
      setRevealed(false)
      setVotingPaused(false)
      setVoteResults({ A: 0, B: 0, C: 0, D: 0, E: 0, total: 0 })
      setRanking([])
      setShowQrOnPresentation(false)
      await emitWithRetry('session-reset', { sessionCode: selectedSession.code }, {
        failureToast: 'Sessão resetada no banco, mas a tela de apresentação pode não ter sido notificada. Recarregue a apresentação.',
      })
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

    // Elapsed-time ticker so the user sees the test is making progress
    // even though the server-side test is a single blocking HTTP request.
    const startedAt = Date.now()
    const ticker = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000)
      setStressTestElapsed(elapsed)
    }, 500)
    setStressTestElapsed(0)

    try {
      const correctAnswer = currentQuestion?.correctAnswer
      const res = await adminFetch('/api/stress-test', {
        method: 'POST',
        body: JSON.stringify({
          sessionCode: selectedSession.code,
          questionId: currentQuestionId,
          correctAnswer: correctAnswer || undefined,
          studentCount: stressTestCount,
          scenario: stressTestScenario,
          dryRun: false,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        toast.error(data?.error || `Erro ${res.status} ao executar stress test.`)
        setStressTestResult(null)
        return
      }

      const result = {
        scenario: data.scenario,
        totalStudents: data.totalStudents ?? stressTestCount,
        connected: data.connected ?? 0,
        voted: data.voted ?? 0,
        failed: data.failed ?? 0,
        durationMs: data.durationMs ?? 0,
        votesPerSecond: data.votesPerSecond ?? 0,
        voteDistribution: data.voteDistribution ?? { A: 0, B: 0, C: 0, D: 0, E: 0 },
        rejectedVotes: data.rejectedVotes ?? 0,
        presenterBlocked: data.presenterBlocked ?? 0,
        badInputBlocked: data.badInputBlocked ?? 0,
        peakConcurrentConnections: data.peakConcurrentConnections ?? 0,
        avgResponseTimeMs: data.avgResponseTimeMs ?? 0,
        memoryRssMb: data.memoryRssMb ?? 0,
        dryRun: data.dryRun ?? false,
        timedOut: data.timedOut ?? false,
        errors: data.errors ?? [],
      }
      setStressTestResult(result)

      if (result.timedOut) {
        toast.warning(
          `Stress test atingiu o tempo limite. Resultados parciais: ${result.voted} votos em ${(result.durationMs / 1000).toFixed(1)}s.`
        )
      } else {
        toast.success(
          `Stress test concluído! ${result.voted} votos em ${(result.durationMs / 1000).toFixed(1)}s.`
        )
      }
    } catch (err) {
      toast.error(
        `Erro ao chamar o serviço de stress test: ${err instanceof Error ? err.message : 'Desconhecido'}`
      )
    } finally {
      clearInterval(ticker)
      setStressTestRunning(false)
    }
  }

  const handleShowQr = () => {
    const newVisible = !showQrOnPresentation
    setShowQrOnPresentation(newVisible)
    // Fire-and-forget — but still retried for reliability.
    emitWithRetry('show-qr', {
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
    await emitWithRetry('activate-question', {
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
            <img src="/logo.png" alt="UEMS" className="h-4 w-4 object-contain opacity-50" />
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
              <div className="flex items-center gap-2">
                <h1 className="truncate text-sm font-semibold text-foreground">
                  {selectedSession.title}
                </h1>
                {/* Socket connection status badge */}
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border whitespace-nowrap ${
                    socketConnected
                      ? 'border-green-500/40 text-green-600 dark:text-green-400 bg-green-500/10'
                      : socketReconnecting
                      ? 'border-[#C8A84B]/50 text-[#C8A84B] bg-[#C8A84B]/10'
                      : 'border-red-500/40 text-red-600 dark:text-red-400 bg-red-500/10'
                  }`}
                  title={
                    socketConnected
                      ? 'Conectado ao servidor de tempo real'
                      : socketReconnecting
                      ? 'Tentando reconectar ao servidor...'
                      : 'Desconectado do servidor'
                  }
                >
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full ${
                      socketConnected
                        ? 'bg-green-500'
                        : socketReconnecting
                        ? 'bg-[#C8A84B] animate-pulse'
                        : 'bg-red-500'
                    }`}
                  />
                  {socketConnected ? 'Conectado' : socketReconnecting ? 'Reconectando...' : 'Desconectado'}
                </span>
              </div>
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
              <TabsTrigger value="banco" className="gap-1.5">
                <Library className="size-3.5" />
                Banco de Questões
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
              {/* Presentation Preview (at the top for better visibility) */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Preview da Apresentação</CardTitle>
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
                <CardContent className="pb-3">
                  <div className="w-full rounded-xl overflow-hidden border border-[#1A2A5E] bg-[#050A1A]" style={{ maxHeight: '300px' }}>
                    <iframe
                      src={`/apresentacao/${selectedSession.code}`}
                      className="w-full border-0"
                      title="Preview da Apresentação"
                      style={{ height: '280px' }}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Session Status + Participant Counter */}
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
                          {totalParticipants || participantCount}
                        </span>
                        <div className="text-sm text-muted-foreground">
                          <div>{(totalParticipants || participantCount) === 1 ? 'participante' : 'participantes'}</div>
                          {totalParticipants > participantCount && participantCount > 0 && (
                            <div className="text-xs text-[#C8A84B]/70">{participantCount} conectados agora</div>
                          )}
                        </div>
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

                {/* Row 3: Session Progress */}
                <Card>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Activity className="size-4 text-[#C8A84B]" />
                          <span className="text-sm font-medium">Progresso</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Questões respondidas:</span>
                          <span className="text-sm font-bold text-[#C8A84B]">
                            {selectedSession.questions.filter(q => q.isRevealed).length}/{totalQuestions}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Votos nesta questão:</span>
                          <span className="text-sm font-bold">{totalVotes}</span>
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div className="w-40 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#C8A84B] rounded-full transition-all duration-500"
                          style={{ width: `${totalQuestions > 0 ? (selectedSession.questions.filter(q => q.isRevealed).length / totalQuestions) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Row 4: Current Question Controls */}
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
                          <div className="max-h-60 overflow-y-auto">
                            <QuestionText text={currentQuestion.text} textSize="sm" imageUrl={currentQuestion.imageUrl} />
                          </div>
                          <div className="grid gap-1.5">
                            {getActiveAlternatives(currentQuestion).map((alt) => {
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
                          {(currentQuestion ? getActiveAlternatives(currentQuestion) : ['A', 'B', 'C', 'D']).map((alt) => {
                            const votes = voteResults[alt as keyof VoteResults] ?? 0
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
            </TabsContent>

            {/* ═══ TAB 3: BANCO DE QUESTÕES ═══ */}
            <TabsContent value="banco">
              {/* Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-foreground">Banco de Questões</h2>
                  <Badge variant="secondary" className="bg-[#00338C]/10 text-[#00338C] dark:bg-[#C8A84B]/10 dark:text-[#C8A84B]">
                    {bankQuestions.length} questão(ões)
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-[#C8A84B] text-[#C8A84B] hover:bg-[#C8A84B]/10"
                    onClick={() => {
                      if (selectedBankIds.size === 0) {
                        toast.error('Selecione questões para importar.')
                        return
                      }
                      setImportTargetSession(selectedSession?.code || '')
                      setShowImportBankDialog(true)
                    }}
                  >
                    <Download className="size-3.5" />
                    Importar para Sessão
                  </Button>
                  <Button
                    size="sm"
                    className="bg-[#00338C] hover:bg-[#00338C]/90 text-white"
                    onClick={() => setShowCreateBankDialog(true)}
                  >
                    <Plus className="size-3.5" />
                    Nova Questão
                  </Button>
                </div>
              </div>

              {/* Filters */}
              <Card className="mb-4">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Select value={bankFilterCategory} onValueChange={setBankFilterCategory}>
                      <SelectTrigger className="w-full sm:w-[200px]">
                        <SelectValue placeholder="Categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas as categorias</SelectItem>
                        {bankCategories.map((cat) => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={bankFilterCourse} onValueChange={setBankFilterCourse}>
                      <SelectTrigger className="w-full sm:w-[220px]">
                        <SelectValue placeholder="Curso" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos os cursos</SelectItem>
                        {bankCourses.map((course) => (
                          <SelectItem key={course} value={course}>{course}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar questões..."
                        value={bankSearch}
                        onChange={(e) => setBankSearch(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Selection controls */}
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={filteredBankQuestions.length > 0 && selectedBankIds.size === filteredBankQuestions.length}
                    onCheckedChange={toggleAllBankSelection}
                  />
                  <span className="text-sm text-muted-foreground">
                    Selecionar todos ({filteredBankQuestions.length})
                  </span>
                </div>
                {selectedBankIds.size > 0 && (
                  <Badge variant="outline" className="border-[#C8A84B]/30 text-[#C8A84B]">
                    {selectedBankIds.size} selecionada(s)
                  </Badge>
                )}
              </div>

              {/* Questions list */}
              {bankLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="size-8 animate-spin text-[#00338C]" />
                </div>
              ) : filteredBankQuestions.length === 0 ? (
                <Card className="py-12">
                  <div className="text-center text-muted-foreground">
                    <Library className="size-12 mx-auto mb-3 opacity-30" />
                    <p className="text-lg font-medium">Nenhuma questão encontrada</p>
                    <p className="text-sm mt-1">
                      {bankQuestions.length === 0
                        ? 'Crie questões no banco para começar.'
                        : 'Tente ajustar os filtros.'}
                    </p>
                  </div>
                </Card>
              ) : (
                <div className="max-h-[500px] overflow-y-auto space-y-3 pr-1 scrollbar-thin scrollbar-thumb-[#1A2A5E] scrollbar-track-transparent">
                  {filteredBankQuestions.map((q) => (
                    <Card
                      key={q.id}
                      className={`transition-colors ${
                        selectedBankIds.has(q.id)
                          ? 'border-[#C8A84B]/50 bg-[#C8A84B]/5'
                          : 'hover:border-[#1A2A5E]'
                      }`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={selectedBankIds.has(q.id)}
                            onCheckedChange={() => toggleBankSelection(q.id)}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <h3 className="font-semibold text-sm text-foreground line-clamp-1">
                                    {q.title}
                                  </h3>
                                  {q.category && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-[#00338C]/30 text-[#00338C] dark:border-[#2196F3]/30 dark:text-[#2196F3]">
                                      {q.category}
                                    </Badge>
                                  )}
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] px-1.5 py-0 border-green-600/30 text-green-700 dark:text-green-400"
                                  >
                                    Resp: {q.correctAnswer}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  {q.year && <span>Ano: {q.year}</span>}
                                  {q.course && <span>Curso: {q.course}</span>}
                                  {q.tags && q.tags.length > 0 && (
                                    <span className="truncate">
                                      {typeof q.tags === 'string' ? q.tags : q.tags.join(', ')}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setDeleteBankQuestionId(q.id)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </main>

        <footer className="mt-auto border-t border-[#1A2A5E] bg-[#0A1128] py-3 text-center text-xs text-[#3A4A7E]">
          <div className="flex items-center justify-center gap-2">
            <img src="/logo.png" alt="UEMS" className="h-4 w-4 object-contain opacity-50" />
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

        {/* Create Bank Question Dialog */}
        <Dialog open={showCreateBankDialog} onOpenChange={setShowCreateBankDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Library className="size-5 text-[#00338C] dark:text-[#C8A84B]" />
                Nova Questão no Banco
              </DialogTitle>
              <DialogDescription>
                Preencha os campos para criar uma questão no banco de questões.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="bank-title">Título *</Label>
                <Input
                  id="bank-title"
                  placeholder="Ex: Questão 1 — Direito Administrativo"
                  value={bankForm.title}
                  onChange={(e) => setBankForm({ ...bankForm, title: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bank-text">Texto da Questão *</Label>
                <Textarea
                  id="bank-text"
                  placeholder="Enunciado da questão..."
                  rows={4}
                  value={bankForm.text}
                  onChange={(e) => setBankForm({ ...bankForm, text: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="bank-year">Ano</Label>
                  <Input
                    id="bank-year"
                    type="number"
                    placeholder="Ex: 2024"
                    value={bankForm.year}
                    onChange={(e) => setBankForm({ ...bankForm, year: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="bank-course">Curso</Label>
                  <Select value={bankForm.course} onValueChange={(v) => setBankForm({ ...bankForm, course: v === '__none__' ? '' : v })}>
                    <SelectTrigger id="bank-course">
                      <SelectValue placeholder="Selecione o curso" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nenhum</SelectItem>
                      {UEMS_COURSES.map((course) => (
                        <SelectItem key={course} value={course}>{course}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Alternativa A *</Label>
                <Input
                  placeholder="Texto da alternativa A"
                  value={bankForm.altA}
                  onChange={(e) => setBankForm({ ...bankForm, altA: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Alternativa B *</Label>
                <Input
                  placeholder="Texto da alternativa B"
                  value={bankForm.altB}
                  onChange={(e) => setBankForm({ ...bankForm, altB: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Alternativa C *</Label>
                <Input
                  placeholder="Texto da alternativa C"
                  value={bankForm.altC}
                  onChange={(e) => setBankForm({ ...bankForm, altC: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Alternativa D *</Label>
                <Input
                  placeholder="Texto da alternativa D"
                  value={bankForm.altD}
                  onChange={(e) => setBankForm({ ...bankForm, altD: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Alternativa E (opcional)</Label>
                <Input
                  placeholder="Texto da alternativa E"
                  value={bankForm.altE}
                  onChange={(e) => setBankForm({ ...bankForm, altE: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Resposta Correta *</Label>
                  <Select value={bankForm.correctAnswer} onValueChange={(v) => setBankForm({ ...bankForm, correctAnswer: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ALT_LABELS.map((alt) => (
                        <SelectItem key={alt} value={alt}>Alternativa {alt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="bank-category">Categoria</Label>
                  <Input
                    id="bank-category"
                    placeholder="Ex: Direito, Matemática..."
                    value={bankForm.category}
                    onChange={(e) => setBankForm({ ...bankForm, category: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="bank-tags">Tags (separadas por vírgula)</Label>
                  <Input
                    id="bank-tags"
                    placeholder="Ex: enade, 2024, direito"
                    value={bankForm.tags}
                    onChange={(e) => setBankForm({ ...bankForm, tags: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="bank-imageUrl">URL da Imagem</Label>
                  <Input
                    id="bank-imageUrl"
                    placeholder="https://..."
                    value={bankForm.imageUrl}
                    onChange={(e) => setBankForm({ ...bankForm, imageUrl: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateBankDialog(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleCreateBankQuestion}
                disabled={creatingBankQuestion}
                className="bg-[#00338C] hover:bg-[#00338C]/90 text-white"
              >
                {creatingBankQuestion && <Loader2 className="size-4 animate-spin" />}
                Criar Questão
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Import to Session Dialog */}
        <Dialog open={showImportBankDialog} onOpenChange={setShowImportBankDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Download className="size-5 text-[#C8A84B]" />
                Importar para Sessão
              </DialogTitle>
              <DialogDescription>
                Selecione a sessão de destino para importar {selectedBankIds.size} questão(ões) selecionada(s).
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="p-3 rounded-lg bg-[#00338C]/5 dark:bg-[#C8A84B]/5 border border-[#00338C]/10 dark:border-[#C8A84B]/10">
                <p className="text-sm font-medium text-foreground">
                  {selectedBankIds.size} questão(ões) selecionada(s)
                </p>
              </div>
              <div className="grid gap-2">
                <Label>Sessão de Destino</Label>
                <Select value={importTargetSession} onValueChange={setImportTargetSession}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a sessão" />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions.map((session) => (
                      <SelectItem key={session.code} value={session.code}>
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-xs text-[#00338C] dark:text-[#C8A84B]">
                            {session.code}
                          </span>
                          <span className="truncate">{session.title}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowImportBankDialog(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleImportToSession}
                disabled={importingBank || !importTargetSession}
                className="bg-[#C8A84B] hover:bg-[#C8A84B]/90 text-white"
              >
                {importingBank && <Loader2 className="size-4 animate-spin" />}
                <Download className="size-4" />
                Importar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Bank Question Confirmation */}
        <AlertDialog
          open={!!deleteBankQuestionId}
          onOpenChange={(open) => !open && setDeleteBankQuestionId(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir Questão do Banco</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir esta questão do banco? Esta ação não pode
                ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteBankQuestion}
                disabled={deleting}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                {deleting && <Loader2 className="size-4 animate-spin" />}
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Stress Test Dialog */}
        <Dialog open={stressTestOpen} onOpenChange={setStressTestOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Zap className="size-5 text-red-500" />
                Stress Test — Simulação de Acesso
              </DialogTitle>
              <DialogDescription>
                Simule o acesso simultâneo de múltiplos alunos (até 5000) respondendo à questão atual,
                incluindo cenários de ataque que validam a segurança do servidor.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              {/* Config */}
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-2">
                    <Label>Cenário</Label>
                    <Select
                      value={stressTestScenario}
                      onValueChange={(v) =>
                        setStressTestScenario(
                          v as 'normal' | 'flood' | 'bad-presenter' | 'bad-input' | 'long-lived' | 'mixed'
                        )
                      }
                      disabled={stressTestRunning}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione um cenário" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal (1000 alunos, 1 voto)</SelectItem>
                        <SelectItem value="flood">Flood (10 votos rápidos/aluno)</SelectItem>
                        <SelectItem value="bad-presenter">Ataque: Bad Presenter</SelectItem>
                        <SelectItem value="bad-input">Ataque: Bad Input</SelectItem>
                        <SelectItem value="long-lived">Long-Lived (200 alunos, 30s)</SelectItem>
                        <SelectItem value="mixed">Misto (alunos + atacantes)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Número de Alunos</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {[100, 500, 1000, 2000, 5000].map((count) => (
                        <Button
                          key={count}
                          size="sm"
                          variant={stressTestCount === count ? 'default' : 'outline'}
                          onClick={() => setStressTestCount(count)}
                          disabled={stressTestRunning}
                          className={stressTestCount === count ? 'bg-red-600 hover:bg-red-700 text-white' : ''}
                        >
                          {count}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <Activity className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-700 dark:text-amber-300 space-y-1">
                    <p>
                      <strong>Questão ativa:</strong>{' '}
                      {currentQuestion
                        ? `Q${currentIndex + 1} — ${currentQuestion.text.slice(0, 80)}...`
                        : 'Nenhuma questão selecionada'}
                    </p>
                    <p className="opacity-80">
                      O teste roda no servidor (porta 3004), não no navegador. Pode levar de 30s a 90s
                      dependendo do cenário e do número de alunos.
                    </p>
                  </div>
                </div>
              </div>

              {/* Running indicator */}
              {stressTestRunning && (
                <div className="flex flex-col items-center gap-4 py-6">
                  <div className="relative">
                    <div className="size-16 rounded-full border-4 border-red-200 dark:border-red-900" />
                    <div className="absolute inset-0 size-16 rounded-full border-4 border-red-500 border-t-transparent animate-spin" />
                    <Zap className="absolute inset-0 m-auto size-6 text-red-500" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="font-semibold text-lg">
                      Simulando {stressTestCount} alunos — cenário {stressTestScenario}...
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Tempo decorrido: {stressTestElapsed}s (limite: 90s)
                    </p>
                  </div>
                  {/* Visual progress bar — shows elapsed time vs 90s timeout */}
                  <div className="w-full px-4">
                    <Progress value={Math.min((stressTestElapsed / 90) * 100, 100)} className="h-2" />
                  </div>
                </div>
              )}

              {/* Results */}
              {stressTestResult && !stressTestRunning && (
                <div className="space-y-3">
                  {/* Scenario badge + health indicator */}
                  <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted/50 border">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="font-mono text-xs">
                        {stressTestResult.scenario ?? stressTestScenario}
                      </Badge>
                      {stressTestResult.dryRun && (
                        <Badge variant="outline" className="text-xs text-amber-600">
                          Dry Run
                        </Badge>
                      )}
                      {stressTestResult.timedOut && (
                        <Badge variant="outline" className="text-xs text-red-600">
                          Timeout (parcial)
                        </Badge>
                      )}
                    </div>
                    {/* Health indicator: green ≥95%, yellow 80-95%, red <80% */}
                    {(() => {
                      const total = stressTestResult.voted + stressTestResult.failed + (stressTestResult.rejectedVotes ?? 0)
                      const successRate = total > 0 ? (stressTestResult.voted / total) * 100 : 0
                      const isAttackScenario =
                        stressTestResult.scenario === 'bad-presenter' ||
                        stressTestResult.scenario === 'bad-input'
                      // For attack scenarios, success = votes REJECTED (presenterBlocked + badInputBlocked)
                      const attackTotal =
                        (stressTestResult.presenterBlocked ?? 0) +
                        (stressTestResult.badInputBlocked ?? 0) +
                        (stressTestResult.errors?.length ?? 0) > 0
                          ? (stressTestResult.presenterBlocked ?? 0) +
                            (stressTestResult.badInputBlocked ?? 0) + 1
                          : 1
                      const attackBlocked =
                        (stressTestResult.presenterBlocked ?? 0) +
                        (stressTestResult.badInputBlocked ?? 0)
                      const attackRate = attackTotal > 0 ? (attackBlocked / attackTotal) * 100 : 0
                      const rate = isAttackScenario ? attackRate : successRate
                      const color =
                        rate >= 95
                          ? 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700'
                          : rate >= 80
                            ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700'
                            : 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700'
                      const label =
                        rate >= 95 ? 'Saudável' : rate >= 80 ? 'Atenção' : 'Crítico'
                      return (
                        <span
                          className={`text-xs font-bold px-2.5 py-1 rounded-full border ${color}`}
                        >
                          {label} ({rate.toFixed(0)}%)
                        </span>
                      )
                    })()}
                  </div>

                  {/* 4-column metrics grid — Row 1: core results */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="p-2.5 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                      <p className="text-[10px] text-green-600 dark:text-green-400 uppercase tracking-wide">Conectados</p>
                      <p className="text-xl font-bold text-green-700 dark:text-green-300">{stressTestResult.connected}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800">
                      <p className="text-[10px] text-teal-600 dark:text-teal-400 uppercase tracking-wide">Votos Aceitos</p>
                      <p className="text-xl font-bold text-teal-700 dark:text-teal-300">{stressTestResult.voted}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                      <p className="text-[10px] text-red-600 dark:text-red-400 uppercase tracking-wide">Falhas</p>
                      <p className="text-xl font-bold text-red-700 dark:text-red-300">{stressTestResult.failed}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                      <p className="text-[10px] text-purple-600 dark:text-purple-400 uppercase tracking-wide">Votos/seg</p>
                      <p className="text-xl font-bold text-purple-700 dark:text-purple-300">{stressTestResult.votesPerSecond}</p>
                    </div>
                  </div>

                  {/* Row 2: rejection / security metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="p-2.5 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
                      <p className="text-[10px] text-orange-600 dark:text-orange-400 uppercase tracking-wide">Votos Rejeit.</p>
                      <p className="text-xl font-bold text-orange-700 dark:text-orange-300">{stressTestResult.rejectedVotes ?? 0}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800">
                      <p className="text-[10px] text-rose-600 dark:text-rose-400 uppercase tracking-wide">Presenter Bloq.</p>
                      <p className="text-xl font-bold text-rose-700 dark:text-rose-300">{stressTestResult.presenterBlocked ?? 0}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800">
                      <p className="text-[10px] text-rose-600 dark:text-rose-400 uppercase tracking-wide">Bad Input Bloq.</p>
                      <p className="text-xl font-bold text-rose-700 dark:text-rose-300">{stressTestResult.badInputBlocked ?? 0}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700">
                      <p className="text-[10px] text-slate-600 dark:text-slate-400 uppercase tracking-wide">Pico Conexões</p>
                      <p className="text-xl font-bold text-slate-700 dark:text-slate-300">{stressTestResult.peakConcurrentConnections ?? 0}</p>
                    </div>
                  </div>

                  {/* Row 3: timing / memory */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700">
                      <p className="text-[10px] text-slate-600 dark:text-slate-400 uppercase tracking-wide">Tempo Resp. (ms)</p>
                      <p className="text-xl font-bold text-slate-700 dark:text-slate-300">{stressTestResult.avgResponseTimeMs ?? 0}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700">
                      <p className="text-[10px] text-slate-600 dark:text-slate-400 uppercase tracking-wide">Duração</p>
                      <p className="text-xl font-bold text-slate-700 dark:text-slate-300">
                        {(stressTestResult.durationMs / 1000).toFixed(1)}s
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700">
                      <p className="text-[10px] text-slate-600 dark:text-slate-400 uppercase tracking-wide">Memória (MB)</p>
                      <p className="text-xl font-bold text-slate-700 dark:text-slate-300">{stressTestResult.memoryRssMb ?? 0}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700">
                      <p className="text-[10px] text-slate-600 dark:text-slate-400 uppercase tracking-wide">Total Esperado</p>
                      <p className="text-xl font-bold text-slate-700 dark:text-slate-300">{stressTestResult.totalStudents}</p>
                    </div>
                  </div>

                  {/* Vote distribution */}
                  {Object.values(stressTestResult.voteDistribution).some((v) => v > 0) && (
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
                  )}

                  {stressTestResult.errors.length > 0 && (
                    <div className="p-2 rounded bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800">
                      <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                        Erros ({stressTestResult.errors.length}):
                      </p>
                      {stressTestResult.errors.slice(0, 5).map((err, i) => (
                        <p key={i} className="text-xs text-red-500 dark:text-red-300 truncate" title={err}>
                          {err}
                        </p>
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
            <img src="/logo.png" alt="UEMS" className="h-8 object-contain" />
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
          <img src="/logo.png" alt="UEMS" className="h-4 w-4 object-contain opacity-50" />
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
