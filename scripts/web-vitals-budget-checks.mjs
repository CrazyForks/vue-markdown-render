export function collectWebVitalsInteractionWarnings(name, interaction, budget = {}) {
  const warnings = []
  const label = interaction?.label ?? 'unknown'

  if (typeof budget.phaseCls === 'number' && !(interaction?.phaseCls <= budget.phaseCls))
    warnings.push(`[${name}:${label}] interaction CLS exceeded ${budget.phaseCls}: ${interaction?.phaseCls}.`)

  const hasEventTimingBudget = typeof budget.eventTimingInpCandidateMs === 'number'
    || typeof budget.eventTimingMaxInputDelayMs === 'number'
    || typeof budget.eventTimingMaxProcessingMs === 'number'

  if (hasEventTimingBudget) {
    const observerSupported = interaction?.eventObserverSupported === true
    const interactionGroupCount = Number(interaction?.interactionGroupCount || 0)
    const scriptedInteractionCount = Number(interaction?.scriptedInteractionCount || 0)
    const interactionCountDelta = Number(interaction?.performanceInteractionCountDelta || 0)
    const belowEventTimingThreshold = interaction?.belowEventTimingThreshold === true
      || (interactionGroupCount === 0 && (scriptedInteractionCount > 0 || interactionCountDelta > 0))

    if (!observerSupported) {
      warnings.push(`[${name}:${label}] Event Timing measurement unavailable: observer unsupported.`)
    }
    else if (!(interactionGroupCount >= 1) && !belowEventTimingThreshold) {
      warnings.push(`[${name}:${label}] Event Timing measurement unavailable: no interaction groups captured.`)
    }
    else {
      const inpCandidateMs = belowEventTimingThreshold ? 0 : interaction.eventTimingInpCandidateMs
      const maxInputDelayMs = belowEventTimingThreshold ? 0 : interaction.eventTimingMaxInputDelayMs
      const maxProcessingMs = belowEventTimingThreshold ? 0 : interaction.eventTimingMaxProcessingMs
      if (typeof budget.eventTimingInpCandidateMs === 'number' && !(inpCandidateMs <= budget.eventTimingInpCandidateMs))
        warnings.push(`[${name}:${label}] INP candidate exceeded ${budget.eventTimingInpCandidateMs}ms: ${inpCandidateMs}.`)
      if (typeof budget.eventTimingMaxInputDelayMs === 'number' && !(maxInputDelayMs <= budget.eventTimingMaxInputDelayMs))
        warnings.push(`[${name}:${label}] max input delay exceeded ${budget.eventTimingMaxInputDelayMs}ms: ${maxInputDelayMs}.`)
      if (typeof budget.eventTimingMaxProcessingMs === 'number' && !(maxProcessingMs <= budget.eventTimingMaxProcessingMs))
        warnings.push(`[${name}:${label}] max event processing exceeded ${budget.eventTimingMaxProcessingMs}ms: ${maxProcessingMs}.`)
    }
  }

  if (interaction?.eventObserverError)
    warnings.push(`[${name}:${label}] Event Timing observer failed: ${interaction.eventObserverError}.`)

  return warnings
}
