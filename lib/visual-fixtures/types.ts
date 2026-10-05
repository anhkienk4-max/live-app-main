export type DashboardFixtureScenario = 'reference' | 'empty' | 'stress' | 'calendar' | 'shift-detail' | 'edit-shift' | 'edit-shift-duplicate' | 'edit-shift-actions' | 'create-shift' | 'shift-lifecycle' | 'live'

export interface VisualFixtureState {
  enabled: boolean
  scenario: DashboardFixtureScenario
}
