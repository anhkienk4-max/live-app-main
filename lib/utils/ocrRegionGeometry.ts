import type {
  OcrCropBox,
  OcrDashboardCandidate,
  OcrPoint,
  ReportDashboardPlatform,
  ReportMetricKey,
} from '@/lib/types/database.types'

type RegionMetricCell = {
  key: ReportMetricKey
  x: number
  y: number
  width: number
  height: number
}

const canonicalRoiBasis: Record<Exclude<ReportDashboardPlatform, 'other'>, OcrCropBox> = {
  shopee_live: { left: .115, top: .21, width: .645, height: .36 },
  tiktok_shop: { left: .22, top: .08, width: .58, height: .57 },
}

export function normalizeMetricCellToRoi<T extends RegionMetricCell>(
  platform: Exclude<ReportDashboardPlatform, 'other'>,
  cell: T,
): T {
  const basis = canonicalRoiBasis[platform]
  return {
    ...cell,
    x: (cell.x - basis.left) / basis.width,
    y: (cell.y - basis.top) / basis.height,
    width: cell.width / basis.width,
    height: cell.height / basis.height,
  }
}

export function roiPointToImage(
  candidate: OcrDashboardCandidate,
  x: number,
  y: number,
): OcrPoint {
  const [topLeft, topRight, bottomRight, bottomLeft] = candidate.quadrilateral
  return {
    x:
      topLeft.x * (1 - x) * (1 - y)
      + topRight.x * x * (1 - y)
      + bottomRight.x * x * y
      + bottomLeft.x * (1 - x) * y,
    y:
      topLeft.y * (1 - x) * (1 - y)
      + topRight.y * x * (1 - y)
      + bottomRight.y * x * y
      + bottomLeft.y * (1 - x) * y,
  }
}

export function roiCellBoundingBox(
  candidate: OcrDashboardCandidate,
  cell: RegionMetricCell,
  kind: 'label' | 'value',
) {
  const labelHeight = candidate.platform === 'tiktok_shop' ? .045 : .055
  const labelCenterY = cell.y - (candidate.platform === 'tiktok_shop' ? .055 : .075)
  const tiktokValueCenterY = candidate.platform === 'tiktok_shop'
    && ['advertising_cost', 'average_order_value', 'live_ctr'].includes(cell.key)
    ? cell.y - .008
    : cell.y
  const centerY = kind === 'label' ? labelCenterY : tiktokValueCenterY
  const tiktokValueWidth = candidate.platform === 'tiktok_shop'
    ? cell.key === 'gmv'
      ? Math.min(.48, cell.width * 1.08)
      : cell.key === 'current_viewers'
        ? Math.min(.14, cell.width * 1.2)
          : cell.key === 'average_view_duration_seconds'
            ? Math.min(.24, cell.width * 1.5)
            : cell.key === 'advertising_cost'
              ? Math.min(.13, cell.width * 1.6)
          : ['advertising_cost', 'average_order_value', 'live_ctr'].includes(cell.key)
            ? cell.width
          : Math.min(.22, cell.width * (
            cell.key === 'items_sold' ? 1.6 : 1.35
          ))
    : cell.width
  const width = kind === 'label'
    ? Math.min(.30, cell.width * (candidate.platform === 'tiktok_shop' ? 1.55 : 1.35))
    : tiktokValueWidth
  const height = kind === 'label'
    ? labelHeight
    : candidate.platform === 'tiktok_shop'
      ? cell.key === 'gmv' ? Math.min(cell.height, .12)
        : cell.key === 'shares' ? Math.min(cell.height * 1.5, .1)
        : Math.min(cell.height, .07)
      : Math.min(cell.height, cell.key === 'sales' ? .16 : .09)
  const corners = [
    roiPointToImage(candidate, cell.x - width / 2, centerY - height / 2),
    roiPointToImage(candidate, cell.x + width / 2, centerY - height / 2),
    roiPointToImage(candidate, cell.x + width / 2, centerY + height / 2),
    roiPointToImage(candidate, cell.x - width / 2, centerY + height / 2),
  ]
  return boundingBox(corners)
}

function boundingBox(points: OcrPoint[]) {
  const minX = Math.min(...points.map(point => point.x))
  const minY = Math.min(...points.map(point => point.y))
  const maxX = Math.max(...points.map(point => point.x))
  const maxY = Math.max(...points.map(point => point.y))
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}
