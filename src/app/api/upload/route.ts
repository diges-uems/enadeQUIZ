import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

// POST /api/upload - Upload an image file (FormData or base64 dataUrl)
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || ''

    let buffer: Buffer
    let ext = '.png'

    if (contentType.includes('multipart/form-data')) {
      // FormData upload
      const formData = await request.formData()
      const file = formData.get('file') as File | null

      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 })
      }

      const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml']
      if (!allowedTypes.includes(file.type)) {
        return NextResponse.json(
          { error: 'Invalid file type. Allowed: PNG, JPEG, GIF, WebP, SVG' },
          { status: 400 }
        )
      }

      if (file.size > 5 * 1024 * 1024) {
        return NextResponse.json(
          { error: 'File too large. Maximum size: 5MB' },
          { status: 400 }
        )
      }

      const bytes = await file.arrayBuffer()
      buffer = Buffer.from(bytes)
      ext = path.extname(file.name) || `.${file.type.split('/')[1]}`
    } else {
      // JSON upload with base64 dataUrl
      const body = await request.json()
      const { dataUrl, filename } = body as { dataUrl: string; filename?: string }

      if (!dataUrl || !dataUrl.startsWith('data:')) {
        return NextResponse.json({ error: 'Invalid data URL' }, { status: 400 })
      }

      // Extract mime type and base64 data
      const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/)
      if (!match) {
        return NextResponse.json({ error: 'Invalid image data URL' }, { status: 400 })
      }

      const imageType = match[1]
      const base64Data = match[2]

      const allowedTypes = ['png', 'jpeg', 'jpg', 'gif', 'webp', 'svg+xml']
      if (!allowedTypes.includes(imageType)) {
        return NextResponse.json(
          { error: 'Invalid image type. Allowed: PNG, JPEG, GIF, WebP, SVG' },
          { status: 400 }
        )
      }

      buffer = Buffer.from(base64Data, 'base64')

      // Check size (decoded)
      if (buffer.length > 5 * 1024 * 1024) {
        return NextResponse.json(
          { error: 'File too large. Maximum size: 5MB' },
          { status: 400 }
        )
      }

      if (filename) {
        ext = path.extname(filename) || `.${imageType === 'svg+xml' ? 'svg' : imageType}`
      } else {
        ext = `.${imageType === 'svg+xml' ? 'svg' : imageType}`
      }
    }

    // Generate unique filename
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`

    // Ensure uploads directory exists
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
    await mkdir(uploadsDir, { recursive: true })

    // Write file
    const filepath = path.join(uploadsDir, uniqueName)
    await writeFile(filepath, buffer)

    // Return the public URL
    const url = `/uploads/${uniqueName}`

    return NextResponse.json({ url, filename: uniqueName })
  } catch (error) {
    console.error('Error uploading file:', error)
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
  }
}
