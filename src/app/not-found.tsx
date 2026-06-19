/**
 * 404 Not Found page — shown when a route doesn't exist.
 * Styled to match the UEMS dark theme.
 */
import Link from 'next/link'

export default function NotFound() {
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
          textAlign: 'center',
          maxWidth: '500px',
        }}
      >
        <h1
          style={{
            fontSize: '4rem',
            marginBottom: '1rem',
            color: '#C8A84B',
          }}
        >
          404
        </h1>
        <h2
          style={{
            fontSize: '1.25rem',
            marginBottom: '0.5rem',
            color: '#E8EDFF',
          }}
        >
          Página não encontrada
        </h2>
        <p style={{ marginBottom: '2rem', color: '#8892B0' }}>
          A página que você procura não existe ou foi movida.
        </p>
        <Link
          href="/"
          style={{
            display: 'inline-block',
            background: '#00338C',
            color: '#FFFFFF',
            padding: '0.75rem 1.5rem',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Voltar ao início
        </Link>
      </div>
    </div>
  )
}
