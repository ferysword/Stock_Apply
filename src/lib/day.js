import { fromInputDate, toInputDate } from './format'

// Une journée de buvette va de 4h à 4h le lendemain (les soirées finissent après minuit)
export const DAY_START_HOUR = 4

export function businessDay(date = new Date()) {
  const shifted = new Date(date)
  shifted.setHours(shifted.getHours() - DAY_START_HOUR)
  return toInputDate(shifted)
}

export function dayStart(day) {
  const date = fromInputDate(day)
  date.setHours(DAY_START_HOUR, 0, 0, 0)
  return date
}

export function dayEnd(day) {
  const date = dayStart(day)
  date.setDate(date.getDate() + 1)
  return date
}

export function addDays(day, n) {
  const date = fromInputDate(day)
  date.setDate(date.getDate() + n)
  return toInputDate(date)
}

export function formatDay(day, options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) {
  const label = fromInputDate(day).toLocaleDateString('fr-FR', options)
  return label.charAt(0).toUpperCase() + label.slice(1)
}
