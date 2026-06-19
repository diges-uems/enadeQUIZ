'use client'

/**
 * Global error boundary — catches errors that error.tsx CANNOT catch,
 * specifically errors in the root layout (layout.tsx) itself.
 *
 * This is a separate file required by Next.js. It must render its own
 * <html> and <body> tags since the root layout is bypassed when this
 * boundary activates.
 */
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Global error boundary:', error)
  }, [error])

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#050A1A',
          color: '#E8EDFF',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '2rem',
        }}
      >
        <div
          style={{
            maxWidth: '600px',
            width: '100%',
            background: '#0D1B3E',
            borderRadius: '16px',
            padding: '2rem',
            border: '1px solid #1A2A5E',
          }}
        >
          <h1
            style={{
              fontSize: '1.5rem',
              marginBottom: '1rem',
              color: '#C8A84B',
            }}
          >
            ⚠️ Erro global
          </h1>
          <p style={{ marginBottom: '1rem', color: '#8892B0' }}>
            Ocorreu um erro crítico na aplicação.
          </p>
          {error?.message && (
            <pre
              style={{
                background: '#050A1A',
                padding: '1rem',
                borderRadius: '8px',
                overflow: 'auto',
                fontSize: '0.85rem',
                color: '#FF6B6B',
                marginBottom: '1rem',
                border: '1px solid #1A2A5E',
              }}
            >
              {error.message}
            </pre>
          )}
          {error?.digest && (
            <p style={{ fontSize: '0.8rem', color: '#3A4A7E', marginBottom: '1rem' }}>
              Error ID: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              background: '#00338C',
              color: '#FFFFFF',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  )
}
