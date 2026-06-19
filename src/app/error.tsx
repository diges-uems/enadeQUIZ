'use client'

/**
 * Root error boundary — catches any runtime error in the app and shows
 * a friendly error page instead of a blank 500.
 *
 * The error message + stack are displayed so operators can diagnose
 * production issues without access to server logs.
 */
import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log to console for server-side debugging
    console.error('App error boundary:', error)
  }, [error])

  return (
    <div
      style={{
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
          ⚠️ Erro na aplicação
        </h1>
        <p style={{ marginBottom: '1rem', color: '#8892B0' }}>
          Ocorreu um erro inesperado. Tente recarregar a página.
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
    </div>
  )
}
