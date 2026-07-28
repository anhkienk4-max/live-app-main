import type { OcrRecognizedWord } from '@/lib/types/database.types'

export interface OcrWordLine {
  id: string
  pass: OcrRecognizedWord['pass']
  words: OcrRecognizedWord[]
  left: number
  top: number
  right: number
  bottom: number
}

export function groupOcrWordLines(words: readonly OcrRecognizedWord[]): OcrWordLine[] {
  const grouped = new Map<string, OcrRecognizedWord[]>()
  for (const word of words) {
    const lineWords = grouped.get(word.line_id) || []
    lineWords.push(word)
    grouped.set(word.line_id, lineWords)
  }
  return [...grouped.entries()]
    .flatMap(([id, lineWords]) => {
      if (!lineWords.length) return []
      const ordered = [...lineWords].sort(
        (left, right) => left.bounding_box.x - right.bounding_box.x,
      )
      return [{
        id,
        pass: ordered[0].pass,
        words: ordered,
        ...wordBounds(ordered),
      }]
    })
    .sort((left, right) => left.top - right.top || left.left - right.left)
}

/**
 * Tesseract frequently wraps long dashboard labels into two physical lines.
 * Search both the original lines and spatially compatible adjacent-line
 * windows. Windows never cross OCR passes and require column overlap, which
 * prevents labels from neighboring KPI cards being concatenated.
 */
export function buildOcrLabelWindows(
  words: readonly OcrRecognizedWord[],
): OcrWordLine[] {
  const lines = groupOcrWordLines(words)
  const windows: OcrWordLine[] = [...lines]

  for (let firstIndex = 0; firstIndex < lines.length - 1; firstIndex += 1) {
    const first = lines[firstIndex]
    const firstHeight = Math.max(1, first.bottom - first.top)
    for (let secondIndex = firstIndex + 1; secondIndex < lines.length; secondIndex += 1) {
      const second = lines[secondIndex]
      const secondHeight = Math.max(1, second.bottom - second.top)
      const verticalGap = second.top - first.bottom
      if (verticalGap > Math.max(firstHeight, secondHeight) * 1.8 + 6) break
      if (first.pass !== second.pass) continue
      if (verticalGap < -Math.min(firstHeight, secondHeight) * .35) continue

      const overlap = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left))
      const narrowerWidth = Math.max(
        1,
        Math.min(first.right - first.left, second.right - second.left),
      )
      const firstCenter = (first.left + first.right) / 2
      const secondCenter = (second.left + second.right) / 2
      const aligned = overlap / narrowerWidth >= .18
        || Math.abs(firstCenter - secondCenter) <= Math.max(
          first.right - first.left,
          second.right - second.left,
        ) * .28
      if (!aligned) continue

      const mergedWords = [...first.words, ...second.words].sort((left, right) => {
        const verticalDelta = left.bounding_box.y - right.bounding_box.y
        return Math.abs(verticalDelta) > Math.max(left.bounding_box.height, right.bounding_box.height) * .5
          ? verticalDelta
          : left.bounding_box.x - right.bounding_box.x
      })
      windows.push({
        id: `${first.id}+${second.id}`,
        pass: first.pass,
        words: mergedWords,
        ...wordBounds(mergedWords),
      })
    }
  }

  return windows.sort((left, right) =>
    left.top - right.top
    || right.words.length - left.words.length
    || left.left - right.left,
  )
}

export function wordBounds(words: readonly OcrRecognizedWord[]) {
  const left = Math.min(...words.map(word => word.bounding_box.x))
  const top = Math.min(...words.map(word => word.bounding_box.y))
  const right = Math.max(...words.map(word => word.bounding_box.x + word.bounding_box.width))
  const bottom = Math.max(...words.map(word => word.bounding_box.y + word.bounding_box.height))
  return { left, top, right, bottom }
}
