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

    if (!observerSupported) {
      warnings.push(`[${name}:${label}] Event Timing measurement unavailable: observer unsupported.`)
    }
    else if (!(interactionGroupCount >= 1)) {
      warnings.push(`[${name}:${label}] Event Timing measurement unavailable: no interaction groups captured.`)
    }
    else {
      if (typeof budget.eventTimingInpCandidateMs === 'number' && !(interaction.eventTimingInpCandidateMs <= budget.eventTimingInpCandidateMs))
        warnings.push(`[${name}:${label}] INP candidate exceeded ${budget.eventTimingInpCandidateMs}ms: ${interaction.eventTimingInpCandidateMs}.`)
      if (typeof budget.eventTimingMaxInputDelayMs === 'number' && !(interaction.eventTimingMaxInputDelayMs <= budget.eventTimingMaxInputDelayMs))
        warnings.push(`[${name}:${label}] max input delay exceeded ${budget.eventTimingMaxInputDelayMs}ms: ${interaction.eventTimingMaxInputDelayMs}.`)
      if (typeof budget.eventTimingMaxProcessingMs === 'number' && !(interaction.eventTimingMaxProcessingMs <= budget.eventTimingMaxProcessingMs))
        warnings.push(`[${name}:${label}] max event processing exceeded ${budget.eventTimingMaxProcessingMs}ms: ${interaction.eventTimingMaxProcessingMs}.`)
    }
  }

  if (interaction?.eventObserverError)
    warnings.push(`[${name}:${label}] Event Timing observer failed: ${interaction.eventObserverError}.`)

  return warnings
}
