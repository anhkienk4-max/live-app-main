// Ambient type declarations for runtime packages not hoisted in local workspace node_modules

declare module 'hls.js' {
  export interface HlsConfig {
    lowLatencyMode?: boolean
    liveSyncDurationCount?: number
    maxBufferLength?: number
    backBufferLength?: number
    xhrSetup?: (xhr: XMLHttpRequest, url: string) => void
    [key: string]: unknown
  }

  export interface HlsErrorData {
    fatal?: boolean
    type?: string
    response?: {
      code?: number
      [key: string]: unknown
    }
    [key: string]: unknown
  }

  export default class Hls {
    static isSupported(): boolean
    static Events: {
      MEDIA_ATTACHED: string
      MANIFEST_PARSED: string
      ERROR: string
      [key: string]: string
    }
    static ErrorTypes: {
      NETWORK_ERROR: string
      MEDIA_ERROR: string
      OTHER_ERROR: string
      [key: string]: string
    }
    constructor(config?: HlsConfig)
    destroy(): void
    startLoad(startPosition?: number): void
    loadSource(url: string): void
    attachMedia(video: HTMLVideoElement): void
    on(event: string, callback: (...args: any[]) => void): void
  }
}

declare module '@tanstack/react-query' {
  export interface QueryClientConfig {
    defaultOptions?: {
      queries?: Record<string, unknown>
      mutations?: Record<string, unknown>
    }
  }

  export class QueryClient {
    constructor(config?: QueryClientConfig)
    clear(): void
    [key: string]: unknown
  }

  export interface QueryClientProviderProps {
    client: QueryClient
    children?: import('react').ReactNode
  }

  export const QueryClientProvider: import('react').FC<QueryClientProviderProps>
}

declare module '@tanstack/react-virtual' {
  export interface VirtualItem {
    index: number
    start: number
    size: number
    end?: number
    lane?: number
    key?: string | number
  }

  export interface VirtualizerOptions<TScrollElement extends Element | Window, TItemElement extends Element> {
    count: number
    getScrollElement: () => TScrollElement | null
    estimateSize: (index: number) => number
    overscan?: number
    [key: string]: unknown
  }

  export interface Virtualizer<TScrollElement extends Element | Window, TItemElement extends Element> {
    getTotalSize: () => number
    getVirtualItems: () => VirtualItem[]
    [key: string]: unknown
  }

  export function useVirtualizer<
    TScrollElement extends Element | Window = HTMLDivElement,
    TItemElement extends Element = HTMLDivElement,
  >(options: VirtualizerOptions<TScrollElement, TItemElement>): Virtualizer<TScrollElement, TItemElement>
}

declare module 'motion/react' {
  export interface Transition {
    duration?: number
    ease?: string | number[]
    delay?: number
    staggerChildren?: number
    [key: string]: unknown
  }

  export interface TargetAndTransition {
    opacity?: number
    y?: number | string
    x?: number | string
    scale?: number
    transition?: Transition
    [key: string]: unknown
  }

  export type Variant = TargetAndTransition | Record<string, unknown>

  export interface Variants {
    [key: string]: Variant
  }

  export interface HTMLMotionProps<T extends keyof import('react').JSX.IntrinsicElements>
    extends import('react').HTMLAttributes<HTMLElement> {
    initial?: boolean | string | TargetAndTransition
    animate?: boolean | string | TargetAndTransition
    exit?: boolean | string | TargetAndTransition
    transition?: Transition
    variants?: Variants
    className?: string
    children?: import('react').ReactNode
    [key: string]: unknown
  }

  export interface MotionComponent<T extends keyof import('react').JSX.IntrinsicElements> {
    (props: HTMLMotionProps<T> & import('react').RefAttributes<HTMLElement>): import('react').ReactElement | null
  }

  export const motion: {
    div: MotionComponent<'div'>
    span: MotionComponent<'span'>
    button: MotionComponent<'button'>
    [key: string]: any
  }

  export const AnimatePresence: import('react').FC<{
    children?: import('react').ReactNode
    mode?: 'sync' | 'popLayout' | 'wait'
    initial?: boolean
    onExitComplete?: () => void
  }>

  export function useReducedMotion(): boolean | null
}
