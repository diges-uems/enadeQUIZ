import { NextRequest, NextResponse } from 'next/server'

// POST /api/admin/auth - Simple admin authentication
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { password } = body

    const adminPassword = process.env.ADMIN_SECRET_KEY || 'enade2024'

    if (password === adminPassword) {
      // In a real app, this would generate a JWT or session token
      // For simplicity, we just return success
      return NextResponse.json({ 
        success: true, 
        token: Buffer.from(`admin:${Date.now()}`).toString('base64') 
      })
    }

    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  } catch (error) {
    console.error('Error authenticating admin:', error)
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 })
  }
}
