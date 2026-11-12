'use client'

import { PHOTO_QUALITY, canDownscale, shouldDownscale, targetDimensions } from '@/lib/photo-upload'

/**
 * Downscales very large JPEG/WebP photos before upload so they send faster on job-site connections.
 * Anything that cannot be decoded here (HEIC on most browsers, video, PNG) is returned unchanged,
 * and any failure falls back to the original file, so a photo is never lost to resizing.
 */
export async function preparePhotoForUpload(file: File): Promise<File> {
  if (!canDownscale(file.type) || typeof createImageBitmap !== 'function') return file
  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    if (!shouldDownscale({ type: file.type, size: file.size, width: bitmap.width, height: bitmap.height })) return file
    const { width, height } = targetDimensions(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, file.type, PHOTO_QUALITY))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name, { type: file.type, lastModified: file.lastModified })
  } catch {
    return file
  } finally {
    bitmap?.close()
  }
}
