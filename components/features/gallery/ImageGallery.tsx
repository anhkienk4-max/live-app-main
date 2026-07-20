'use client'

import * as React from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { X, ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut } from 'lucide-react'

interface ImageGalleryProps {
  images: string[]
  initialIndex?: number
}

export function ImageGallery({ images, initialIndex = 0 }: ImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null)
  const [zoom, setZoom] = React.useState(1)

  const openLightbox = (index: number) => {
    setSelectedIndex(index)
    setZoom(1)
  }

  const closeLightbox = () => {
    setSelectedIndex(null)
    setZoom(1)
  }

  const goToPrevious = () => {
    if (selectedIndex !== null && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1)
      setZoom(1)
    }
  }

  const goToNext = () => {
    if (selectedIndex !== null && selectedIndex < images.length - 1) {
      setSelectedIndex(selectedIndex + 1)
      setZoom(1)
    }
  }

  const handleZoomIn = () => setZoom(Math.min(zoom + 0.25, 3))
  const handleZoomOut = () => setZoom(Math.max(zoom - 0.25, 0.5))

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedIndex === null) return
      
      if (e.key === 'ArrowLeft') goToPrevious()
      if (e.key === 'ArrowRight') goToNext()
      if (e.key === 'Escape') closeLightbox()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedIndex])

  if (images.length === 0) return null

  return (
    <>
      {/* Gallery Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {images.map((image, index) => (
          <div
            key={index}
            className="relative aspect-square rounded-lg overflow-hidden cursor-pointer group"
            onClick={() => openLightbox(index)}
          >
            <img
              src={image}
              alt={`Image ${index + 1}`}
              className="w-full h-full object-cover transition-transform group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all flex items-center justify-center">
              <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {selectedIndex !== null && (
        <Dialog open={selectedIndex !== null} onOpenChange={closeLightbox}>
          <DialogContent size="full" className="border-0 bg-black p-0">
            <div className="relative w-full h-[95vh] flex items-center justify-center">
              {/* Close Button */}
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-4 right-4 z-50 text-white hover:bg-white/20"
                onClick={closeLightbox}
              >
                <X className="h-6 w-6" />
              </Button>

              {/* Navigation Buttons */}
              {selectedIndex > 0 && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute left-4 z-50 text-white hover:bg-white/20"
                  onClick={goToPrevious}
                >
                  <ChevronLeft className="h-8 w-8" />
                </Button>
              )}
              {selectedIndex < images.length - 1 && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute right-4 z-50 text-white hover:bg-white/20"
                  onClick={goToNext}
                >
                  <ChevronRight className="h-8 w-8" />
                </Button>
              )}

              {/* Zoom Controls */}
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-50 flex items-center gap-2 bg-black/50 rounded-lg p-2">
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-white hover:bg-white/20"
                  onClick={handleZoomOut}
                  disabled={zoom <= 0.5}
                >
                  <ZoomOut className="h-5 w-5" />
                </Button>
                <span className="text-white text-sm px-3">{Math.round(zoom * 100)}%</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-white hover:bg-white/20"
                  onClick={handleZoomIn}
                  disabled={zoom >= 3}
                >
                  <ZoomIn className="h-5 w-5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-white hover:bg-white/20"
                  onClick={() => window.open(images[selectedIndex], '_blank')}
                >
                  <Download className="h-5 w-5" />
                </Button>
              </div>

              {/* Image Counter */}
              <div className="absolute top-4 left-4 z-50 text-white text-sm bg-black/50 px-3 py-1 rounded">
                {selectedIndex + 1} / {images.length}
              </div>

              {/* Image */}
              <img
                src={images[selectedIndex]}
                alt={`Image ${selectedIndex + 1}`}
                className="max-w-full max-h-full object-contain"
                style={{ transform: `scale(${zoom})`, transition: 'transform 0.2s' }}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
