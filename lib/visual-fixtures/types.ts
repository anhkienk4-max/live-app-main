export type DashboardFixtureScenario = 'reference' | 'empty' | 'stress'

export interface VisualFixtureState {
  enabled: boolean
  scenario: DashboardFixtureScenario
}
