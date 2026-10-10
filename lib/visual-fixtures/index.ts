export function isVisualFixtureMode(): boolean {
  return process.env.NEXT_PUBLIC_VISUAL_FIXTURES === 'true'
}
