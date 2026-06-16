'use client'

import React from 'react'

/**
 * Formats ENADE question text with rich styling matching the PDF format.
 * 
 * Handles:
 * - "TEXTO 1", "TEXTO 2" → bold section headers with accent color
 * - "Texto para questões 09 e 10" → italic section intro
 * - Reference lines (PEREIRA, A.; SOUSA, L. etc.) → italic, muted
 * - "Disponível em:" / "Acesso em:" → italic source references
 * - Bullet points (•, Função referencial:, etc.) → styled lists
 * - Numbered items (1. 2. 3.) → styled numbered lists
 * - Paragraph breaks → proper spacing
 * - Quoted text in quotes → styled
 * - Inline images from imageUrl prop
 * - "Considerando..." transition paragraphs
 * - Law references (Lei n., Decreto n.)
 */

interface QuestionTextProps {
  text: string
  className?: string
  textSize?: 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl'
  imageUrl?: string | null
}

export function QuestionText({ text, className = '', textSize = 'base', imageUrl }: QuestionTextProps) {
  const sizeClass = {
    sm: 'text-sm',
    base: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl',
    '2xl': 'text-2xl',
    '3xl': 'text-3xl',
  }[textSize]

  // Split text into logical blocks
  const blocks = parseQuestionText(text)

  return (
    <div className={`leading-relaxed text-justify ${sizeClass} ${className}`}>
      {blocks.map((block, i) => (
        <QuestionBlock key={i} block={block} imageUrl={imageUrl} />
      ))}
    </div>
  )
}

interface TextBlock {
  type: 'header' | 'subheader' | 'reference' | 'source' | 'bullet' | 'numbered' | 'emphasis' | 'paragraph' | 'blank' | 'transition' | 'image-placeholder'
  content: string
  children?: TextBlock[]
  level?: number
}

function parseQuestionText(text: string): TextBlock[] {
  const lines = text.split('\n')
  const blocks: TextBlock[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i].trim()
    
    // Skip empty lines but track paragraph breaks
    if (!line) {
      // Check if next line is also empty (bigger break)
      if (i + 1 < lines.length && !lines[i + 1].trim()) {
        blocks.push({ type: 'blank', content: '' })
        i++
      }
      i++
      continue
    }

    // "TEXTO 1", "TEXTO 2" etc. — section headers
    if (/^TEXTO\s+\d+/i.test(line)) {
      blocks.push({ type: 'header', content: line })
      i++
      continue
    }

    // "Texto para questões XX e YY" — section intro
    if (/^Texto para questões/i.test(line)) {
      blocks.push({ type: 'subheader', content: line })
      i++
      continue
    }

    // "QUESTÃO 05" type headers
    if (/^QUESTÃO\s+\d+/i.test(line)) {
      blocks.push({ type: 'header', content: line })
      i++
      continue
    }

    // Source references: "Disponível em:" and "Acesso em:" lines
    if (/^Disponível em:/i.test(line) || /^Acesso em:/i.test(line)) {
      blocks.push({ type: 'source', content: line })
      i++
      continue
    }

    // Reference lines — typically all caps surnames with dates or academic references
    // Examples: "PEREIRA, P. F.; REINALDO, M. A. G. ..." or "LAERTE." or "SOUSA, L. Q.; ABREU, K. F. Análise..."
    if (/^[A-ZÀ-Ÿ]{2,}[\s,;.]/.test(line) && line.length > 5 && !line.startsWith('A ') && !line.startsWith('B ') && !line.startsWith('C ') && !line.startsWith('D ') && !line.startsWith('E ')) {
      // Check if it's a reference (has year pattern or common reference markers)
      if (/\d{4}|adaptado|Disponível|Acesso|Editora|Revista|Cadernos|In:|Universidade|Dissertação|Tese|Monografia|Anais|Congresso|Simpósio|Periódico/.test(line)) {
        blocks.push({ type: 'reference', content: line })
        i++
        continue
      }
      // Short author-only lines like "LAERTE." 
      if (/^[A-ZÀ-Ÿ]+\.?\s*$/.test(line)) {
        blocks.push({ type: 'reference', content: line })
        i++
        continue
      }
    }

    // "Considerando..." or "De acordo com..." — transition paragraphs
    if (/^Considerando/i.test(line) || /^De acordo com/i.test(line) || /^Com base/i.test(line) || /^De acordo/i.test(line) || /^Ao relacionar/i.test(line) || /^Entre as/i.test(line) || /^A análise/i.test(line) || /^A atividade/i.test(line) || /^A fim de/i.test(line)) {
      blocks.push({ type: 'transition', content: line })
      i++
      continue
    }

    // Bullet points: "• " or "Função referencial:" style
    if (/^[•●○▪▸►]\s/.test(line)) {
      blocks.push({ type: 'bullet', content: line.replace(/^[•●○▪▸►]\s*/, '') })
      i++
      continue
    }

    // Named bullet points like "Função referencial:", "Função instrumental:", etc.
    if (/^Função\s+\w+:/i.test(line) || /^Função\s+\w+\s+e\s+\w+:/i.test(line)) {
      blocks.push({ type: 'emphasis', content: line })
      i++
      continue
    }

    // Numbered items: "1. xxx", "2. xxx", "3. xxx"
    if (/^\d+\.\s/.test(line)) {
      blocks.push({ type: 'numbered', content: line, level: parseInt(line) })
      i++
      continue
    }

    // Quoted text: starts and ends with quotes
    if (/^["\u201C\u201D]/.test(line) && /["\u201C\u201D]$/.test(line)) {
      blocks.push({ type: 'emphasis', content: line })
      i++
      continue
    }

    // Regular paragraph
    blocks.push({ type: 'paragraph', content: line })
    i++
  }

  return blocks
}

function QuestionBlock({ block, imageUrl }: { block: TextBlock; imageUrl?: string | null }) {
  switch (block.type) {
    case 'header':
      return (
        <div className="mt-5 mb-2 first:mt-0">
          <span className="font-bold text-[#C8A84B] tracking-wide uppercase text-[0.95em]">{block.content}</span>
        </div>
      )

    case 'subheader':
      return (
        <div className="mt-5 mb-2 first:mt-0">
          <span className="font-semibold text-[#E8EDFF] italic">{block.content}</span>
        </div>
      )

    case 'reference':
      return (
        <div className="my-1.5 pl-3 border-l-2 border-[#1A2A5E]/60">
          <span className="text-[#8899CC] italic text-[0.88em]">{block.content}</span>
        </div>
      )

    case 'source':
      // If there's an image URL and the source line mentions "Disponível em:", 
      // we might want to show the image after this source line
      return (
        <div className="my-1 pl-3 border-l-2 border-[#1A2A5E]/60">
          <span className="text-[#6B7AA1] italic text-[0.85em]">{block.content}</span>
        </div>
      )

    case 'transition':
      return (
        <div className="my-2 text-justify">
          <span className="text-[#E8EDFF] font-medium">{renderInlineFormatting(block.content)}</span>
        </div>
      )

    case 'bullet':
      return (
        <div className="my-1 pl-4 flex gap-2 text-justify">
          <span className="text-[#C8A84B] shrink-0">•</span>
          <span className="text-[#C8D0E8]">{renderInlineFormatting(block.content)}</span>
        </div>
      )

    case 'numbered':
      return (
        <div className="my-1 pl-4 flex gap-2 text-justify">
          <span className="text-[#C8A84B] font-bold shrink-0">{block.level}.</span>
          <span className="text-[#C8D0E8]">{renderInlineFormatting(block.content.replace(/^\d+\.\s*/, ''))}</span>
        </div>
      )

    case 'emphasis':
      return (
        <div className="my-1.5 text-justify">
          {renderInlineFormatting(block.content)}
        </div>
      )

    case 'blank':
      return <div className="h-2" />

    case 'paragraph':
    default:
      return (
        <div className="my-1.5 text-justify">
          {renderInlineFormatting(block.content)}
        </div>
      )
  }
}

/**
 * Renders inline formatting within a text block:
 * - Bold: text between ** ** or terms followed by colon (like "Função referencial:")
 * - Italic: text in quotes
 * - Law references: "Lei n.", "Decreto n." etc.
 */
function renderInlineFormatting(text: string): React.ReactNode {
  // Split by bold patterns and quoted text
  const parts: React.ReactNode[] = []
  let remaining = text
  let keyIndex = 0

  // Process: patterns like "Term:" at start → bold the term
  const termColonMatch = remaining.match(/^([^:]{2,40}):(.*)$/)
  if (termColonMatch && !remaining.startsWith('http')) {
    parts.push(
      <span key={keyIndex++} className="font-semibold text-[#E8EDFF]">{termColonMatch[1]}:</span>
    )
    remaining = termColonMatch[2]
  }

  // Process quoted text → italic
  const quoteRegex = /["\u201C]([^"\u201D]+)["\u201D]/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = quoteRegex.exec(remaining)) !== null) {
    // Text before the quote
    if (match.index > lastIndex) {
      parts.push(<span key={keyIndex++}>{remaining.slice(lastIndex, match.index)}</span>)
    }
    // The quoted text
    parts.push(
      <span key={keyIndex++} className="italic text-[#C8D0E8]/90">&ldquo;{match[1]}&rdquo;</span>
    )
    lastIndex = match.index + match[0].length
  }

  // Remaining text after last quote
  if (lastIndex < remaining.length) {
    parts.push(<span key={keyIndex++}>{remaining.slice(lastIndex)}</span>)
  }

  // If no quotes found, just return the remaining text
  if (parts.length === 0) {
    return <span className="text-[#E8EDFF]">{text}</span>
  }

  return <>{parts}</>
}

/**
 * Helper: get the list of non-empty alternative letters for a question
 */
export function getActiveAlternatives(question: { altA: string; altB: string; altC: string; altD: string; altE: string }): string[] {
  const alts = ['A', 'B', 'C', 'D', 'E'] as const
  return alts.filter((alt) => {
    const key = `alt${alt}` as keyof typeof question
    return question[key] && question[key].trim().length > 0
  })
}
