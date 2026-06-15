import { NextRequest, NextResponse } from 'next/server'
import { mkdir } from 'fs/promises'
import { createWriteStream } from 'fs'
import path from 'path'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { dataUrl, filename: originalName } = body

    if (!dataUrl) {
      return NextResponse.json({ error: 'No image data provided' }, { status: 400 })
    }

    // Extract base64 data from data URL
    const matches = dataUrl.match(/^data:(image\/(png|jpeg|jpg|gif|webp));base64,(.+)$/)
    if (!matches) {
      return NextResponse.json({ error: 'Invalid image data URL format' }, { status: 400 })
    }

    const mimeType = matches[1]
    const base64Data = matches[3]
    
    // Validate size (base64 is ~33% larger)
    if (base64Data.length > 6.6 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Max 5MB' }, { status: 400 })
    }

    const ext = mimeType.split('/')[1] === 'jpeg' ? 'jpg' : mimeType.split('/')[1]
    const filename = `${Date.now()}-${(originalName || 'image').replace(/[^a-zA-Z0-9.-]/g, '_').replace(/\.[^.]+$/, '')}.${ext}`
    const uploadDir = path.join(process.cwd(), 'public', 'uploads')

    // Ensure uploads directory exists
    try {
      await mkdir(uploadDir, { recursive: true })
    } catch {
      // Directory might already exist
    }

    const filepath = path.join(uploadDir, filename)
    
    // Use streaming write to avoid memory issues with large buffers
    await new Promise<void>((resolve, reject) => {
      const stream = createWriteStream(filepath)
      
      // Convert base64 in chunks to avoid large Buffer allocation
      const chunkSize = 65536 // 64KB chunks
      for (let i = 0; i < base64Data.length; i += chunkSize) {
        const chunk = base64Data.slice(i, i + chunkSize)
        const buffer = Buffer.from(chunk, 'base64')
        stream.write(buffer)
      }
      
      stream.end()
      stream.on('finish', resolve)
      stream.on('error', reject)
    })

    return NextResponse.json({ url: `/uploads/${filename}` })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
