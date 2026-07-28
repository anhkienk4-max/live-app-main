import type {
  OcrCropBox,
  OcrDashboardCandidate,
  OcrPoint,
  OcrRecognizedWord,
  OcrRegionDiagnostics,
  ReportDashboardPlatform,
  ReportMetricKey,
} from '@/lib/types/database.types'
import { isFullImageOcrCrop } from '@/lib/utils/ocrImage'
import {
  normalizeOcrLabel,
  platformMetricLayouts,
  platformOcrConfigs,
  type LayoutMetricCell,
} from '@/lib/utils/ocrMetrics'
import {
  normalizeMetricCellToRoi,
  roiPointToImage,
} from '@/lib/utils/ocrRegionGeometry'
import { buildOcrLabelWindows } from '@/lib/utils/ocrLabelGeometry'
export { roiCellBoundingBox, roiPointToImage } from '@/lib/utils/ocrRegionGeometry'

type Platform = Exclude<ReportDashboardPlatform, 'other'>

type AnchorMatch = {
  platform: Platform
  key: ReportMetricKey
  label: string
  point: OcrPoint
  confidence: number
  wordIds: string[]
  boundingBox: { x: number; y: number; width: number; height: number }
}

type SimilarityTransform = {
  scale: number
  cos: number
  sin: number
  tx: number
  ty: number
}

type ProjectiveTransform =
  | { kind: 'similarity'; similarity: SimilarityTransform }
  | { kind: 'affine'; matrix: [number, number, number, number, number, number] }
  | { kind: 'homography'; matrix: [number, number, number, number, number, number, number, number] }

export type DashboardVisualHint = {
  platform: Platform
  bounding_box: { x: number; y: number; width: number; height: number }
  quadrilateral?: [OcrPoint, OcrPoint, OcrPoint, OcrPoint]
  confidence: number
  rectangularity: number
}

// Runtime card geometry is expressed only inside the detected dashboard ROI.
// The conversion below migrates the old reference coordinate table once; no
// uploaded image is cropped or paired against full-image reference positions.
export const platformRoiMetricLayouts: Record<Platform, LayoutMetricCell[]> = {
  shopee_live: platformMetricLayouts.shopee_live.map(cell =>
    normalizeMetricCellToRoi('shopee_live', cell),
  ),
  tiktok_shop: platformMetricLayouts.tiktok_shop.map(cell =>
    normalizeMetricCellToRoi('tiktok_shop', cell),
  ),
}

export function detectDashboardRegions({
  words,
  imageWidth,
  imageHeight,
  requestedPlatform,
  requestedCrop,
  visualHints = [],
}: {
  words: OcrRecognizedWord[]
  imageWidth: number
  imageHeight: number
  requestedPlatform?: ReportDashboardPlatform
  requestedCrop?: OcrCropBox
  visualHints?: DashboardVisualHint[]
}): {
  candidates: OcrDashboardCandidate[]
  selected?: OcrDashboardCandidate
  diagnostics: OcrRegionDiagnostics
} {
  const anchors = detectAnchorMatches(words)
  const detected = (['shopee_live', 'tiktok_shop'] as const)
    .flatMap(platform => detectPlatformCandidates(
      platform,
      anchors.filter(anchor => anchor.platform === platform),
      imageWidth,
      imageHeight,
      visualHints.filter(hint => hint.platform === platform),
    ))

  const candidates = deduplicateCandidates(detected)
    .sort(compareCandidates)
    .map((candidate, index) => ({ ...candidate, id: `${candidate.platform}-${index + 1}-${candidate.id}` }))

  if (
    requestedCrop
    && !isFullImageOcrCrop(requestedCrop)
    && requestedPlatform
    && requestedPlatform !== 'other'
  ) {
    const manual = manualCropCandidate(
      requestedPlatform,
      requestedCrop,
      anchors,
      imageWidth,
      imageHeight,
    )
    const allCandidates = [manual, ...candidates.filter(candidate =>
      intersectionOverUnion(candidate.bounding_box, manual.bounding_box) < .75,
    )]
    return {
      candidates: allCandidates,
      selected: manual,
      diagnostics: buildDiagnostics(
        allCandidates,
        manual,
        imageWidth,
        imageHeight,
        false,
        'manual_crop',
      ),
    }
  }

  const platformCandidates = requestedPlatform && requestedPlatform !== 'other'
    ? candidates.filter(candidate => candidate.platform === requestedPlatform)
    : candidates
  const strongestVisual = platformCandidates
    .filter(candidate => candidate.source_method === 'color_contour')
    .sort((left, right) => right.confidence - left.confidence)[0]
  const strongestAnchored = platformCandidates
    .filter(candidate => candidate.source_method !== 'color_contour')
    .sort(compareCandidates)[0]
  const top = strongestVisual
    && (!strongestAnchored || strongestAnchored.anchor_count < 3)
    ? strongestVisual
    : platformCandidates[0]
  const second = platformCandidates.find(candidate => candidate !== top)
  const competitivePeer = top
    ? platformCandidates.find(candidate =>
      candidate !== top
      && candidate.platform === top.platform
      && intersectionOverUnion(candidate.bounding_box, top.bounding_box) < .1
      && candidate.anchor_count >= Math.max(4, top.anchor_count - 2)
      && candidate.confidence >= top.confidence - .15
      && candidate.area_ratio >= top.area_ratio * .65
      && candidate.area_ratio <= top.area_ratio * 1.55,
    )
    : undefined
  const visualAreaDominant = Boolean(
    top
    && second
    && top.platform === second.platform
    && top.source_method === 'color_contour'
    && second.source_method === 'color_contour'
    && top.confidence >= .76
    && top.area_ratio >= second.area_ratio * 1.2,
  )
  const cleanRoiBeatsBoundaryCandidate = Boolean(
    top
    && second
    && top.anchor_count >= 4
    && top.confidence >= .52
    && top.confidence > second.confidence
    && !candidateTouchesImageBoundary(top, imageWidth, imageHeight)
    && candidateTouchesImageBoundary(second, imageWidth, imageHeight),
  )
  const anchoredAreaDominant = Boolean(
    top
    && second
    && top.platform === second.platform
    && top.anchor_count >= 4
    && top.anchor_count >= second.anchor_count
    && top.confidence >= second.confidence
    && top.area_ratio >= second.area_ratio * 1.5,
  )
  const anchoredScoreDominant = Boolean(
    top
    && top.anchor_count >= 4
    && (
      cleanRoiBeatsBoundaryCandidate
      || (
        top.confidence >= .64
        && (
          !second
          || top.confidence - second.confidence >= .08
          || top.anchor_count >= second.anchor_count + 2
        )
      )
    ),
  )
  const dominant = Boolean(
    top
    && !competitivePeer
    && (
      visualAreaDominant
      || anchoredAreaDominant
      || anchoredScoreDominant
      || (
        top.confidence >= .68
        && (
          !second
          || top.confidence - second.confidence >= .08
          || top.anchor_count >= second.anchor_count + 2
        )
      )
    ),
  )
  const selected = dominant ? top : undefined
  const ambiguous = Boolean(top && second && !dominant)
  const selectionReason: OcrRegionDiagnostics['selection_reason'] = selected
    ? 'dominant_candidate'
    : ambiguous
      ? 'ambiguous_candidates'
      : top
        ? 'low_confidence'
        : 'no_candidate'

  return {
    candidates,
    selected,
    diagnostics: buildDiagnostics(
      candidates,
      selected,
      imageWidth,
      imageHeight,
      ambiguous,
      selectionReason,
    ),
  }
}

function candidateTouchesImageBoundary(
  candidate: OcrDashboardCandidate,
  imageWidth: number,
  imageHeight: number,
) {
  const box = candidate.bounding_box
  return box.x <= 1
    || box.y <= 1
    || box.x + box.width >= imageWidth - 1
    || box.y + box.height >= imageHeight - 1
}

export function detectVisualDashboardHints(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): DashboardVisualHint[] {
  if (!width || !height || data.length < width * height * 4) return []
  const sampleStep = Math.max(1, Math.floor(Math.max(width, height) / 420))
  const sampledWidth = Math.ceil(width / sampleStep)
  const sampledHeight = Math.ceil(height / sampleStep)
  const masks: Record<Platform, Uint8Array> = {
    shopee_live: new Uint8Array(sampledWidth * sampledHeight),
    tiktok_shop: new Uint8Array(sampledWidth * sampledHeight),
  }

  for (let sampleY = 0; sampleY < sampledHeight; sampleY += 1) {
    for (let sampleX = 0; sampleX < sampledWidth; sampleX += 1) {
      const x = Math.min(width - 1, sampleX * sampleStep)
      const y = Math.min(height - 1, sampleY * sampleStep)
      const offset = (y * width + x) * 4
      const red = data[offset] / 255
      const green = data[offset + 1] / 255
      const blue = data[offset + 2] / 255
      const maximum = Math.max(red, green, blue)
      const minimum = Math.min(red, green, blue)
      const saturation = maximum ? (maximum - minimum) / maximum : 0
      const index = sampleY * sampledWidth + sampleX
      if (red > .55 && red > green * 1.25 && red > blue * 1.45 && saturation > .42) {
        masks.shopee_live[index] = 1
      }
      if (maximum < .42 && saturation > .12) {
        masks.tiktok_shop[index] = 1
      }
    }
  }

  return (Object.entries(masks) as Array<[Platform, Uint8Array]>)
    .flatMap(([platform, mask]) =>
      connectedMaskRegions(mask, sampledWidth, sampledHeight)
        .map(region => {
          const box = {
            x: region.left * sampleStep,
            y: region.top * sampleStep,
            width: Math.min(width, (region.right + 1) * sampleStep) - region.left * sampleStep,
            height: Math.min(height, (region.bottom + 1) * sampleStep) - region.top * sampleStep,
          }
          const boxArea = Math.max(1, (region.right - region.left + 1) * (region.bottom - region.top + 1))
          const areaRatio = box.width * box.height / (width * height)
          const rectangularity = region.count / boxArea
          const quadrilateral = estimateMaskQuadrilateral(
            region,
            sampledWidth,
            sampleStep,
            width,
            height,
          )
          return {
            platform,
            bounding_box: box,
            quadrilateral,
            confidence: Math.min(1, rectangularity * .55 + Math.min(.45, areaRatio * 1.8)),
            rectangularity,
          }
        })
        .filter(hint =>
          hint.bounding_box.width / Math.max(1, hint.bounding_box.height) >= 1.25
          && hint.bounding_box.width / Math.max(1, hint.bounding_box.height) <= 5.5
          && hint.bounding_box.width * hint.bounding_box.height / (width * height) >= .025
          && hint.rectangularity >= .28,
        ),
    )
}

function detectAnchorMatches(words: OcrRecognizedWord[]): AnchorMatch[] {
  const matches: AnchorMatch[] = []
  const windows = buildOcrLabelWindows(words.filter(word => word.pass === 'label'))
  for (const window of windows) {
    const ordered = window.words
    const normalizedWords = ordered.map(word => normalizeOcrLabel(word.text))
    for (const platform of ['shopee_live', 'tiktok_shop'] as const) {
      const aliases = Object.entries(platformOcrConfigs[platform].aliases)
        .map(([label, key]) => ({ label, key, tokens: label.split(' ') }))
        .sort((left, right) => right.tokens.length - left.tokens.length)
      const lineMatches = aliases.flatMap(alias => {
        const match = findFuzzyTokenSequence(normalizedWords, alias.tokens)
        return match && match.similarity >= .84
          ? [{ alias, match }]
          : []
      }).sort((left, right) =>
        right.match.similarity - left.match.similarity
        || right.alias.tokens.length - left.alias.tokens.length,
      )
      const occupiedWordIndexes = new Set<number>()
      const selectedKeys = new Set<ReportMetricKey>()
      for (const { alias, match } of lineMatches) {
        const wordIndexes = Array.from(
          { length: alias.tokens.length },
          (_, index) => match.start + index,
        )
        if (
          selectedKeys.has(alias.key)
          || wordIndexes.some(index => occupiedWordIndexes.has(index))
        ) continue
        const matchedWords = ordered.slice(match.start, match.start + alias.tokens.length)
        if (!matchedWords.length) continue
        const box = boundingBox(matchedWords.map(word => ({
          x: word.bounding_box.x,
          y: word.bounding_box.y,
        })).concat(matchedWords.map(word => ({
          x: word.bounding_box.x + word.bounding_box.width,
          y: word.bounding_box.y + word.bounding_box.height,
        }))))
        const candidate: AnchorMatch = {
          platform,
          key: alias.key,
          label: matchedWords.map(word => word.text).join(' '),
          point: { x: box.x + box.width / 2, y: box.y + box.height / 2 },
          confidence: Math.min(...matchedWords.map(word => word.confidence)) * match.similarity,
          wordIds: matchedWords.map(word => `${word.line_id}:${word.line_index}:${word.text}`),
          boundingBox: box,
        }
        matches.push(candidate)
        selectedKeys.add(alias.key)
        wordIndexes.forEach(index => occupiedWordIndexes.add(index))
      }
    }
  }
  return matches
}

function detectPlatformCandidates(
  platform: Platform,
  anchors: AnchorMatch[],
  imageWidth: number,
  imageHeight: number,
  visualHints: DashboardVisualHint[],
) {
  const canonicalByKey = new Map(
    platformRoiMetricLayouts[platform]
      .filter(cell => cell.x >= -.05 && cell.x <= 1.05 && cell.y >= -.05 && cell.y <= 1.05)
      .map(cell => [cell.key, {
        x: cell.x,
        y: cell.y - (platform === 'tiktok_shop' ? .058 : .07),
      }]),
  )
  const usable = anchors.filter(anchor => canonicalByKey.has(anchor.key))
  const signatureKeys = new Set(
    platform === 'shopee_live'
      ? ['sales', 'add_to_cart', 'gpm', 'average_basket_size', 'pcu', 'click_to_order_rate']
      : ['gmv', 'advertising_cost', 'roi_gmv_max', 'sku_orders', 'average_order_value', 'estimated_gmv'],
  )
  const candidates: OcrDashboardCandidate[] = []

  const seeds: Array<{ transform: ProjectiveTransform; scale: number }> = []
  for (let leftIndex = 0; leftIndex < usable.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < usable.length; rightIndex += 1) {
      const left = usable[leftIndex]
      const right = usable[rightIndex]
      if (left.key === right.key) continue
      const canonicalLeft = canonicalByKey.get(left.key)!
      const canonicalRight = canonicalByKey.get(right.key)!
      const similarity = similarityFromPairs(canonicalLeft, canonicalRight, left.point, right.point)
      if (similarity) seeds.push({
        transform: { kind: 'similarity', similarity },
        scale: similarity.scale,
      })
    }
  }
  for (let firstIndex = 0; firstIndex < usable.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < usable.length; secondIndex += 1) {
      for (let thirdIndex = secondIndex + 1; thirdIndex < usable.length; thirdIndex += 1) {
        const matches = [usable[firstIndex], usable[secondIndex], usable[thirdIndex]]
        if (new Set(matches.map(match => match.key)).size < 3) continue
        const affine = affineFromMatches(matches, canonicalByKey)
        if (!affine) continue
        const quad = roiQuadrilateral(affine)
        seeds.push({
          transform: affine,
          scale: (
            distance(quad[0], quad[1])
            + distance(quad[0], quad[3])
          ) / 2,
        })
      }
    }
  }

  for (const seed of seeds) {
      if (seed.scale < Math.min(imageWidth, imageHeight) * .12) continue
      const tolerance = Math.max(22, seed.scale * .095)
      const inliers = collectTransformInliers(usable, canonicalByKey, seed.transform, tolerance)
      const uniqueKeys = new Set(inliers.map(inlier => inlier.key))
      if (uniqueKeys.size < 2 || !inliers.some(inlier => signatureKeys.has(inlier.key))) continue
      const minimumAffineAnchors = platform === 'tiktok_shop' ? 5 : 3
      const fittedAffine = inliers.length >= minimumAffineAnchors
        ? affineFromMatches(inliers, canonicalByKey)
        : null
      const stableBaseline = fittedAffine || seed.transform
      const fittedHomography = inliers.length >= 6
        ? homographyFromMatches(inliers, canonicalByKey)
        : null
      const baselineError = meanTransformError(inliers, canonicalByKey, stableBaseline)
      const homographyError = fittedHomography
        ? meanTransformError(inliers, canonicalByKey, fittedHomography)
        : Number.POSITIVE_INFINITY
      // Homography can overfit noisy OCR anchors and move an otherwise flat
      // screenshot. Escalate from affine only when residual error proves that a
      // material projective correction is necessary.
      const projective = fittedHomography
        && baselineError > Math.max(10, seed.scale * .012)
        && homographyError <= baselineError * .68
        ? fittedHomography
        : stableBaseline
      const quad = roiQuadrilateral(projective)
      const rawBox = boundingBox(quad)
      const box = clampBoundingBox(rawBox, imageWidth, imageHeight)
      if (box.width < 80 || box.height < 60) continue
      const retainedArea = box.width * box.height / Math.max(1, rawBox.width * rawBox.height)
      if (retainedArea < .72) continue
      const areaRatio = polygonArea(quad) / Math.max(1, imageWidth * imageHeight)
      if (areaRatio < .015 || areaRatio > 1.35) continue
      const aspectRatio = averageQuadAspectRatio(quad)
      const expectedAspect = platform === 'shopee_live'
        ? aspectRatio >= 2.25 && aspectRatio <= 4.6
        : aspectRatio >= 1.45 && aspectRatio <= 2.75
      if (!expectedAspect) continue
      const hint = visualHints
        .map(candidate => ({
          candidate,
          overlap: intersectionOverUnion(candidate.bounding_box, box),
        }))
        .sort((a, b) => b.overlap - a.overlap)[0]
      const readability = inliers.reduce((sum, inlier) => sum + inlier.confidence, 0) / inliers.length / 100
      const completeness = uniqueKeys.size / platformRoiMetricLayouts[platform]
        .filter(cell => cell.x >= 0 && cell.x <= 1 && cell.y >= 0 && cell.y <= 1)
        .length
      const areaScore = Math.min(1, areaRatio / .18)
      const visualScore = hint && hint.overlap >= .25
        ? hint.candidate.confidence
        : 0
      const useVisualGeometry = Boolean(
        platform === 'shopee_live'
        && hint
        && hint.overlap >= .45
        && hint.candidate.confidence >= .5,
      )
      const candidateQuad = useVisualGeometry
        ? hint!.candidate.quadrilateral || boxQuadrilateral(hint!.candidate.bounding_box)
        : quad
      const candidateBox = useVisualGeometry
        ? clampBoundingBox(boundingBox(candidateQuad), imageWidth, imageHeight)
        : box
      const candidateAreaRatio = polygonArea(candidateQuad) / Math.max(1, imageWidth * imageHeight)
      const candidateAspectRatio = averageQuadAspectRatio(candidateQuad)
      const touchesBoundary = candidateBox.x <= 1
        || candidateBox.y <= 1
        || candidateBox.x + candidateBox.width >= imageWidth - 1
        || candidateBox.y + candidateBox.height >= imageHeight - 1
      const boundaryPenalty = touchesBoundary && candidateAreaRatio < .55 ? .12 : 0
      const confidence = Math.max(0, Math.min(
        1,
        uniqueKeys.size / 8 * .45
        + readability * .25
        + areaScore * .15
        + visualScore * .15
        - boundaryPenalty,
      ))
      candidates.push({
        id: `${Math.round(candidateBox.x)}-${Math.round(candidateBox.y)}-${Math.round(candidateBox.width)}-${Math.round(candidateBox.height)}`,
        platform,
        crop_box: toCropBox(candidateBox, imageWidth, imageHeight),
        bounding_box: candidateBox,
        quadrilateral: candidateQuad,
        confidence,
        anchor_labels: [...new Set(inliers.map(inlier => inlier.label))],
        anchor_keys: [...uniqueKeys],
        anchor_count: uniqueKeys.size,
        kpi_completeness: completeness,
        area_ratio: candidateAreaRatio,
        aspect_ratio: candidateAspectRatio,
        ocr_readability: readability,
        source_method: visualScore > 0
          ? 'anchor_and_color'
          : projective.kind === 'homography'
            ? 'anchor_homography'
            : projective.kind === 'affine'
              ? 'anchor_affine'
              : 'anchor_similarity',
        perspective_correction_applied: isPerspectiveQuad(candidateQuad),
      })
  }
  if (platform === 'tiktok_shop') {
    candidates.push(...detectTikTokStructuralCandidates(
      anchors,
      imageWidth,
      imageHeight,
    ))
  }
  for (const hint of visualHints) {
    if (platform !== 'shopee_live') continue
    if (candidates.some(candidate =>
      intersectionOverUnion(candidate.bounding_box, hint.bounding_box) >= .5
      && candidate.anchor_count >= 4,
    )) continue
    const inside = anchors.filter(anchor => pointInsideBox(anchor.point, hint.bounding_box))
    const uniqueKeys = [...new Set(inside.map(anchor => anchor.key))]
    const hintedQuad = hint.quadrilateral || boxQuadrilateral(hint.bounding_box)
    const box = clampBoundingBox(boundingBox(hintedQuad), imageWidth, imageHeight)
    const quad = hintedQuad.map(point => ({
      x: Math.max(0, Math.min(imageWidth, point.x)),
      y: Math.max(0, Math.min(imageHeight, point.y)),
    })) as [OcrPoint, OcrPoint, OcrPoint, OcrPoint]
    candidates.push({
      id: `color-${Math.round(box.x)}-${Math.round(box.y)}-${Math.round(box.width)}-${Math.round(box.height)}`,
      platform,
      crop_box: toCropBox(box, imageWidth, imageHeight),
      bounding_box: box,
      quadrilateral: quad,
      confidence: Math.max(.70, Math.min(.90, hint.confidence + .15)),
      anchor_labels: [...new Set(inside.map(anchor => anchor.label))],
      anchor_keys: uniqueKeys,
      anchor_count: uniqueKeys.length,
      kpi_completeness: uniqueKeys.length / 16,
      area_ratio: box.width * box.height / Math.max(1, imageWidth * imageHeight),
      aspect_ratio: box.width / Math.max(1, box.height),
      ocr_readability: inside.length
        ? inside.reduce((sum, anchor) => sum + anchor.confidence, 0) / inside.length / 100
        : 0,
      source_method: 'color_contour',
      // A color contour alone proves the orange KPI panel exists, but it does
      // not prove that all four estimated edges are reliable enough for a
      // projective warp. Require independent OCR anchors before applying it.
      perspective_correction_applied: uniqueKeys.length >= 4 && isPerspectiveQuad(quad),
    })
  }
  return candidates
}

function detectTikTokStructuralCandidates(
  anchors: AnchorMatch[],
  imageWidth: number,
  imageHeight: number,
): OcrDashboardCandidate[] {
  const signatureKeys = new Set<ReportMetricKey>([
    'gmv',
    'advertising_cost',
    'roi_gmv_max',
    'sku_orders',
    'average_order_value',
    'estimated_gmv',
  ])
  const deduplicated = anchors.filter((anchor, index) =>
    anchors.findIndex(candidate =>
      candidate.key === anchor.key
      && distance(candidate.point, anchor.point) <= Math.max(
        8,
        Math.max(candidate.boundingBox.height, anchor.boundingBox.height) * 1.5,
      ),
    ) === index,
  )
  const adjacencyThreshold = .245
  const unseen = new Set(deduplicated.map((_, index) => index))
  const clusters: AnchorMatch[][] = []

  while (unseen.size) {
    const start = unseen.values().next().value as number
    unseen.delete(start)
    const indexes = [start]
    const cluster: AnchorMatch[] = []
    while (indexes.length) {
      const currentIndex = indexes.pop()!
      const current = deduplicated[currentIndex]
      cluster.push(current)
      for (const candidateIndex of [...unseen]) {
        const candidate = deduplicated[candidateIndex]
        const normalizedDistance = Math.hypot(
          (candidate.point.x - current.point.x) / Math.max(1, imageWidth),
          (candidate.point.y - current.point.y) / Math.max(1, imageHeight),
        )
        if (normalizedDistance > adjacencyThreshold) continue
        unseen.delete(candidateIndex)
        indexes.push(candidateIndex)
      }
    }
    clusters.push(cluster)
  }

  return clusters.flatMap((cluster, clusterIndex) => {
    const bestByKey = new Map<ReportMetricKey, AnchorMatch>()
    for (const anchor of cluster) {
      const previous = bestByKey.get(anchor.key)
      if (!previous || anchor.confidence > previous.confidence) bestByKey.set(anchor.key, anchor)
    }
    const unique = [...bestByKey.values()]
    if (unique.length < 3 || !unique.some(anchor => signatureKeys.has(anchor.key))) return []

    const rowConsistency = tiktokRowConsistency(unique)
    if (rowConsistency < .48) return []
    const bounds = {
      left: Math.min(...unique.map(anchor => anchor.boundingBox.x)),
      top: Math.min(...unique.map(anchor => anchor.boundingBox.y)),
      right: Math.max(...unique.map(anchor => anchor.boundingBox.x + anchor.boundingBox.width)),
      bottom: Math.max(...unique.map(anchor => anchor.boundingBox.y + anchor.boundingBox.height)),
    }
    const spanWidth = Math.max(1, bounds.right - bounds.left)
    const spanHeight = Math.max(1, bounds.bottom - bounds.top)
    const box = clampBoundingBox({
      x: bounds.left - spanWidth * .12,
      y: bounds.top - spanHeight * .14,
      width: spanWidth * 1.44,
      height: spanHeight * 1.48,
    }, imageWidth, imageHeight)
    const aspectRatio = box.width / Math.max(1, box.height)
    const areaRatio = box.width * box.height / Math.max(1, imageWidth * imageHeight)
    if (aspectRatio < 1.2 || aspectRatio > 2.9 || areaRatio < .02 || areaRatio > 1) return []

    const readability = unique.reduce((sum, anchor) => sum + anchor.confidence, 0)
      / unique.length / 100
    const completeness = unique.length / platformRoiMetricLayouts.tiktok_shop.length
    const confidence = Math.min(
      .86,
      .38
      + Math.min(.24, unique.length / 19 * .5)
      + readability * .12
      + rowConsistency * .12
      + Math.min(.06, areaRatio * .25),
    )
    return [{
      id: `cluster-${clusterIndex}-${Math.round(box.x)}-${Math.round(box.y)}-${Math.round(box.width)}-${Math.round(box.height)}`,
      platform: 'tiktok_shop' as const,
      crop_box: toCropBox(box, imageWidth, imageHeight),
      bounding_box: box,
      quadrilateral: boxQuadrilateral(box),
      confidence,
      anchor_labels: unique.map(anchor => anchor.label),
      anchor_keys: unique.map(anchor => anchor.key),
      anchor_count: unique.length,
      kpi_completeness: completeness,
      area_ratio: areaRatio,
      aspect_ratio: aspectRatio,
      ocr_readability: readability,
      source_method: 'anchor_cluster' as const,
      perspective_correction_applied: false,
    }]
  })
}

const tiktokMetricRows: Partial<Record<ReportMetricKey, number>> = {
  gmv: 0,
  items_sold: 1,
  current_viewers: 1,
  impressions: 2,
  total_views: 2,
  advertising_cost: 2,
  click_rate: 2,
  roi_gmv_max: 3,
  ctor: 3,
  average_view_duration_seconds: 3,
  new_followers: 3,
  buyers: 4,
  sku_orders: 4,
  comments: 4,
  product_clicks: 4,
  average_order_value: 5,
  live_ctr: 5,
  shares: 5,
  estimated_gmv: 5,
}

function tiktokRowConsistency(anchors: AnchorMatch[]) {
  const points = anchors.flatMap(anchor => {
    const row = tiktokMetricRows[anchor.key]
    return row === undefined ? [] : [{ row, y: anchor.point.y }]
  })
  if (points.length < 3) return 0
  const meanRow = average(points.map(point => point.row))
  const meanY = average(points.map(point => point.y))
  const rowVariance = points.reduce((sum, point) => sum + (point.row - meanRow) ** 2, 0)
  if (rowVariance <= Number.EPSILON) return 0
  const slope = points.reduce(
    (sum, point) => sum + (point.row - meanRow) * (point.y - meanY),
    0,
  ) / rowVariance
  if (slope <= 0) return 0
  const residual = points.reduce((sum, point) =>
    sum + Math.abs(point.y - (meanY + slope * (point.row - meanRow))),
  0) / points.length
  return Math.max(0, 1 - residual / Math.max(12, Math.abs(slope) * 1.6))
}

function manualCropCandidate(
  platform: Platform,
  crop: OcrCropBox,
  anchors: AnchorMatch[],
  imageWidth: number,
  imageHeight: number,
): OcrDashboardCandidate {
  const box = {
    x: crop.left * imageWidth,
    y: crop.top * imageHeight,
    width: crop.width * imageWidth,
    height: crop.height * imageHeight,
  }
  const inside = anchors.filter(anchor =>
    anchor.platform === platform
    && pointInsideBox(anchor.point, box),
  )
  const quad = boxQuadrilateral(box)
  return {
    id: `manual-${platform}`,
    platform,
    crop_box: crop,
    bounding_box: box,
    quadrilateral: quad,
    confidence: .99,
    anchor_labels: [...new Set(inside.map(anchor => anchor.label))],
    anchor_keys: [...new Set(inside.map(anchor => anchor.key))],
    anchor_count: new Set(inside.map(anchor => anchor.key)).size,
    kpi_completeness: new Set(inside.map(anchor => anchor.key)).size / platformRoiMetricLayouts[platform].length,
    area_ratio: box.width * box.height / Math.max(1, imageWidth * imageHeight),
    aspect_ratio: box.width / Math.max(1, box.height),
    ocr_readability: inside.length
      ? inside.reduce((sum, anchor) => sum + anchor.confidence, 0) / inside.length / 100
      : 0,
    source_method: 'manual_crop',
    perspective_correction_applied: false,
  }
}

function buildDiagnostics(
  candidates: OcrDashboardCandidate[],
  selected: OcrDashboardCandidate | undefined,
  imageWidth: number,
  imageHeight: number,
  ambiguous: boolean,
  selectionReason: OcrRegionDiagnostics['selection_reason'],
): OcrRegionDiagnostics {
  return {
    original_dimensions: { width: imageWidth, height: imageHeight },
    platform_candidates: (['shopee_live', 'tiktok_shop'] as const)
      .map(platform => {
        const platformCandidates = candidates.filter(candidate => candidate.platform === platform)
        return {
          platform,
          anchor_count: Math.max(0, ...platformCandidates.map(candidate => candidate.anchor_count)),
          confidence: Math.max(0, ...platformCandidates.map(candidate => candidate.confidence)),
        }
      })
      .filter(candidate => candidate.confidence > 0),
    dashboard_candidates: candidates,
    selected_candidate_id: selected?.id,
    selected_roi: selected?.crop_box,
    normalized_roi_dimensions: selected
      ? normalizedDimensions(selected.platform)
      : undefined,
    perspective_correction_applied: selected?.perspective_correction_applied || false,
    ambiguous,
    selection_required: !selected,
    selection_reason: selectionReason,
    fallback_usage: 'none',
  }
}

function normalizedDimensions(platform: Platform) {
  return platform === 'shopee_live'
    ? { width: 1600, height: 500 }
    : { width: 2400, height: 1200 }
}

function collectTransformInliers(
  anchors: AnchorMatch[],
  canonicalByKey: Map<ReportMetricKey, OcrPoint>,
  transform: ProjectiveTransform,
  tolerance: number,
) {
  const bestByKey = new Map<ReportMetricKey, AnchorMatch & { distance: number }>()
  for (const anchor of anchors) {
    const canonical = canonicalByKey.get(anchor.key)
    if (!canonical) continue
    const predicted = applyProjective(transform, canonical)
    const distance = Math.hypot(predicted.x - anchor.point.x, predicted.y - anchor.point.y)
    if (distance > tolerance) continue
    const previous = bestByKey.get(anchor.key)
    if (!previous || distance < previous.distance) bestByKey.set(anchor.key, { ...anchor, distance })
  }
  return [...bestByKey.values()]
}

function similarityFromPairs(
  canonicalA: OcrPoint,
  canonicalB: OcrPoint,
  observedA: OcrPoint,
  observedB: OcrPoint,
): SimilarityTransform | null {
  const canonicalDx = canonicalB.x - canonicalA.x
  const canonicalDy = canonicalB.y - canonicalA.y
  const observedDx = observedB.x - observedA.x
  const observedDy = observedB.y - observedA.y
  const canonicalDistance = Math.hypot(canonicalDx, canonicalDy)
  const observedDistance = Math.hypot(observedDx, observedDy)
  if (canonicalDistance < .08 || observedDistance < 12) return null
  const scale = observedDistance / canonicalDistance
  const angle = Math.atan2(observedDy, observedDx) - Math.atan2(canonicalDy, canonicalDx)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return {
    scale,
    cos,
    sin,
    tx: observedA.x - scale * (canonicalA.x * cos - canonicalA.y * sin),
    ty: observedA.y - scale * (canonicalA.x * sin + canonicalA.y * cos),
  }
}

function applySimilarity(transform: SimilarityTransform, point: OcrPoint): OcrPoint {
  return {
    x: transform.scale * (point.x * transform.cos - point.y * transform.sin) + transform.tx,
    y: transform.scale * (point.x * transform.sin + point.y * transform.cos) + transform.ty,
  }
}

function affineFromMatches(
  matches: AnchorMatch[],
  canonicalByKey: Map<ReportMetricKey, OcrPoint>,
): ProjectiveTransform | null {
  const rows: number[][] = []
  const targets: number[] = []
  for (const match of matches) {
    const point = canonicalByKey.get(match.key)
    if (!point) continue
    rows.push([point.x, point.y, 1, 0, 0, 0])
    targets.push(match.point.x)
    rows.push([0, 0, 0, point.x, point.y, 1])
    targets.push(match.point.y)
  }
  if (rows.length < 6) return null
  const solution = rows.length === 6
    ? solveLinearSystem(rows, targets)
    : solveLeastSquares(rows, targets)
  if (!solution || solution.length !== 6) return null
  return {
    kind: 'affine',
    matrix: [
      solution[0],
      solution[1],
      solution[2],
      solution[3],
      solution[4],
      solution[5],
    ],
  }
}

function meanTransformError(
  matches: Array<AnchorMatch & Partial<{ distance: number }>>,
  canonicalByKey: Map<ReportMetricKey, OcrPoint>,
  transform: ProjectiveTransform,
) {
  const errors = matches.flatMap(match => {
    const canonical = canonicalByKey.get(match.key)
    if (!canonical) return []
    return [distance(applyProjective(transform, canonical), match.point)]
  })
  return errors.length
    ? errors.reduce((sum, error) => sum + error, 0) / errors.length
    : Number.POSITIVE_INFINITY
}

function homographyFromMatches(
  matches: Array<AnchorMatch & { distance: number }>,
  canonicalByKey: Map<ReportMetricKey, OcrPoint>,
): ProjectiveTransform | null {
  const rows: number[][] = []
  const targets: number[] = []
  for (const match of matches) {
    const point = canonicalByKey.get(match.key)
    if (!point) continue
    const { x: u, y: v } = point
    const { x, y } = match.point
    rows.push([u, v, 1, 0, 0, 0, -u * x, -v * x])
    targets.push(x)
    rows.push([0, 0, 0, u, v, 1, -u * y, -v * y])
    targets.push(y)
  }
  if (rows.length < 8) return null
  const solution = solveLeastSquares(rows, targets)
  if (!solution || solution.length !== 8) return null
  return {
    kind: 'homography',
    matrix: [
      solution[0],
      solution[1],
      solution[2],
      solution[3],
      solution[4],
      solution[5],
      solution[6],
      solution[7],
    ],
  }
}

function applyProjective(transform: ProjectiveTransform, point: OcrPoint): OcrPoint {
  if (transform.kind === 'similarity') return applySimilarity(transform.similarity, point)
  if (transform.kind === 'affine') {
    const [a, b, c, d, e, f] = transform.matrix
    return {
      x: a * point.x + b * point.y + c,
      y: d * point.x + e * point.y + f,
    }
  }
  const [a, b, c, d, e, f, g, h] = transform.matrix
  const denominator = g * point.x + h * point.y + 1
  return {
    x: (a * point.x + b * point.y + c) / denominator,
    y: (d * point.x + e * point.y + f) / denominator,
  }
}

function roiQuadrilateral(transform: ProjectiveTransform): [OcrPoint, OcrPoint, OcrPoint, OcrPoint] {
  return [
    applyProjective(transform, { x: 0, y: 0 }),
    applyProjective(transform, { x: 1, y: 0 }),
    applyProjective(transform, { x: 1, y: 1 }),
    applyProjective(transform, { x: 0, y: 1 }),
  ]
}

function solveLeastSquares(rows: number[][], targets: number[]) {
  const columns = rows[0]?.length || 0
  if (!columns) return null
  const normal = Array.from({ length: columns }, () => Array(columns).fill(0))
  const vector = Array(columns).fill(0)
  for (let row = 0; row < rows.length; row += 1) {
    for (let left = 0; left < columns; left += 1) {
      vector[left] += rows[row][left] * targets[row]
      for (let right = 0; right < columns; right += 1) {
        normal[left][right] += rows[row][left] * rows[row][right]
      }
    }
  }
  return solveLinearSystem(normal, vector)
}

function solveLinearSystem(matrix: number[][], vector: number[]) {
  const size = matrix.length
  const augmented = matrix.map((row, index) => [...row, vector[index]])
  for (let pivot = 0; pivot < size; pivot += 1) {
    let best = pivot
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[best][pivot])) best = row
    }
    if (Math.abs(augmented[best][pivot]) < 1e-9) return null
    ;[augmented[pivot], augmented[best]] = [augmented[best], augmented[pivot]]
    const divisor = augmented[pivot][pivot]
    for (let column = pivot; column <= size; column += 1) augmented[pivot][column] /= divisor
    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue
      const factor = augmented[row][pivot]
      for (let column = pivot; column <= size; column += 1) {
        augmented[row][column] -= factor * augmented[pivot][column]
      }
    }
  }
  return augmented.map(row => row[size])
}

function findFuzzyTokenSequence(words: string[], tokens: string[]) {
  let best: { start: number; similarity: number } | null = null
  for (let start = 0; start <= words.length - tokens.length; start += 1) {
    const candidate = words.slice(start, start + tokens.length).join(' ')
    const expected = tokens.join(' ')
    const similarity = stringSimilarity(candidate, expected)
    if (!best || similarity > best.similarity) best = { start, similarity }
  }
  return best
}

function stringSimilarity(left: string, right: string) {
  if (left === right) return 1
  const rows = Array.from({ length: left.length + 1 }, (_, row) => [row])
  for (let column = 1; column <= right.length; column += 1) rows[0][column] = column
  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      rows[row][column] = Math.min(
        rows[row - 1][column] + 1,
        rows[row][column - 1] + 1,
        rows[row - 1][column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      )
    }
  }
  return 1 - rows[left.length][right.length] / Math.max(left.length, right.length, 1)
}

function deduplicateCandidates(candidates: OcrDashboardCandidate[]) {
  const selected: OcrDashboardCandidate[] = []
  for (const candidate of [...candidates].sort(compareCandidates)) {
    const duplicate = selected.find(existing =>
      existing.platform === candidate.platform
      && intersectionOverUnion(existing.bounding_box, candidate.bounding_box) >= .55,
    )
    if (!duplicate) selected.push(candidate)
  }
  return selected
}

function compareCandidates(left: OcrDashboardCandidate, right: OcrDashboardCandidate) {
  return right.anchor_count - left.anchor_count
    || right.confidence - left.confidence
    || right.kpi_completeness - left.kpi_completeness
    || right.area_ratio - left.area_ratio
}

function connectedMaskRegions(mask: Uint8Array, width: number, height: number) {
  const seen = new Uint8Array(mask.length)
  const regions: Array<{
    left: number
    top: number
    right: number
    bottom: number
    count: number
    points: number[]
  }> = []
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue
    const stack = [start]
    seen[start] = 1
    let left = width
    let top = height
    let right = 0
    let bottom = 0
    let count = 0
    const points: number[] = []
    while (stack.length) {
      const current = stack.pop()!
      const x = current % width
      const y = Math.floor(current / width)
      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
      count += 1
      points.push(current)
      for (const neighbor of [current - 1, current + 1, current - width, current + width]) {
        if (neighbor < 0 || neighbor >= mask.length || seen[neighbor] || !mask[neighbor]) continue
        const neighborX = neighbor % width
        if (Math.abs(neighborX - x) > 1) continue
        seen[neighbor] = 1
        stack.push(neighbor)
      }
    }
    regions.push({ left, top, right, bottom, count, points })
  }
  return regions
}

function estimateMaskQuadrilateral(
  region: {
    left: number
    top: number
    right: number
    bottom: number
    points: number[]
  },
  sampledWidth: number,
  sampleStep: number,
  imageWidth: number,
  imageHeight: number,
): [OcrPoint, OcrPoint, OcrPoint, OcrPoint] {
  const columns = new Map<number, { top: number; bottom: number }>()
  const rows = new Map<number, { left: number; right: number }>()
  for (const index of region.points) {
    const x = index % sampledWidth
    const y = Math.floor(index / sampledWidth)
    const column = columns.get(x)
    if (column) {
      column.top = Math.min(column.top, y)
      column.bottom = Math.max(column.bottom, y)
    } else {
      columns.set(x, { top: y, bottom: y })
    }
    const row = rows.get(y)
    if (row) {
      row.left = Math.min(row.left, x)
      row.right = Math.max(row.right, x)
    } else {
      rows.set(y, { left: x, right: x })
    }
  }

  const maximumColumnHeight = Math.max(
    1,
    ...[...columns.values()].map(column => column.bottom - column.top + 1),
  )
  const stableColumns = [...columns.entries()]
    .filter(([, column]) => column.bottom - column.top + 1 >= maximumColumnHeight * .72)
    .sort(([left], [right]) => left - right)
  const maximumRowWidth = Math.max(
    1,
    ...[...rows.values()].map(row => row.right - row.left + 1),
  )
  const stableRows = [...rows.entries()]
    .filter(([, row]) => row.right - row.left + 1 >= maximumRowWidth * .72)
    .sort(([left], [right]) => left - right)

  if (stableColumns.length < 4 || stableRows.length < 4) {
    return boxQuadrilateral({
      x: region.left * sampleStep,
      y: region.top * sampleStep,
      width: (region.right - region.left + 1) * sampleStep,
      height: (region.bottom - region.top + 1) * sampleStep,
    })
  }

  const columnBand = Math.max(2, Math.round(stableColumns.length * .12))
  const leftColumns = stableColumns.slice(0, columnBand)
  const rightColumns = stableColumns.slice(-columnBand)
  const topLeft = {
    x: region.left,
    y: average(leftColumns.map(([, column]) => column.top)),
  }
  const topRight = {
    x: region.right + 1,
    y: average(rightColumns.map(([, column]) => column.top)),
  }
  const bottomRight = {
    x: region.right + 1,
    y: average(rightColumns.map(([, column]) => column.bottom + 1)),
  }
  const bottomLeft = {
    x: region.left,
    y: average(leftColumns.map(([, column]) => column.bottom + 1)),
  }

  return [topLeft, topRight, bottomRight, bottomLeft].map(point => ({
    x: Math.max(0, Math.min(imageWidth, point.x * sampleStep)),
    y: Math.max(0, Math.min(imageHeight, point.y * sampleStep)),
  })) as [OcrPoint, OcrPoint, OcrPoint, OcrPoint]
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
}

function boundingBox(points: OcrPoint[]) {
  const left = Math.min(...points.map(point => point.x))
  const top = Math.min(...points.map(point => point.y))
  const right = Math.max(...points.map(point => point.x))
  const bottom = Math.max(...points.map(point => point.y))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function clampBoundingBox(
  box: { x: number; y: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number,
) {
  const left = Math.max(0, Math.min(imageWidth - 1, box.x))
  const top = Math.max(0, Math.min(imageHeight - 1, box.y))
  const right = Math.max(left + 1, Math.min(imageWidth, box.x + box.width))
  const bottom = Math.max(top + 1, Math.min(imageHeight, box.y + box.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function boxQuadrilateral(
  box: { x: number; y: number; width: number; height: number },
): [OcrPoint, OcrPoint, OcrPoint, OcrPoint] {
  return [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height },
  ]
}

function polygonArea(points: OcrPoint[]) {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]
    return sum + point.x * next.y - next.x * point.y
  }, 0)) / 2
}

function averageQuadAspectRatio([topLeft, topRight, bottomRight, bottomLeft]: OcrDashboardCandidate['quadrilateral']) {
  const width = (distance(topLeft, topRight) + distance(bottomLeft, bottomRight)) / 2
  const height = (distance(topLeft, bottomLeft) + distance(topRight, bottomRight)) / 2
  return width / Math.max(1, height)
}

function isPerspectiveQuad([topLeft, topRight, bottomRight, bottomLeft]: OcrDashboardCandidate['quadrilateral']) {
  const top = distance(topLeft, topRight)
  const bottom = distance(bottomLeft, bottomRight)
  const left = distance(topLeft, bottomLeft)
  const right = distance(topRight, bottomRight)
  const widthSkew = Math.abs(top - bottom) / Math.max(top, bottom, 1)
  const heightSkew = Math.abs(left - right) / Math.max(left, right, 1)
  return widthSkew > .04 || heightSkew > .04
}

function distance(left: OcrPoint, right: OcrPoint) {
  return Math.hypot(left.x - right.x, left.y - right.y)
}

function toCropBox(
  box: { x: number; y: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number,
): OcrCropBox {
  return {
    left: Math.max(0, box.x / imageWidth),
    top: Math.max(0, box.y / imageHeight),
    width: Math.min(1, box.width / imageWidth),
    height: Math.min(1, box.height / imageHeight),
  }
}

function intersectionOverUnion(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
) {
  const intersectionWidth = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x))
  const intersectionHeight = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y))
  const intersection = intersectionWidth * intersectionHeight
  const union = left.width * left.height + right.width * right.height - intersection
  return union > 0 ? intersection / union : 0
}

function pointInsideBox(
  point: OcrPoint,
  box: { x: number; y: number; width: number; height: number },
) {
  return point.x >= box.x
    && point.x <= box.x + box.width
    && point.y >= box.y
    && point.y <= box.y + box.height
}
