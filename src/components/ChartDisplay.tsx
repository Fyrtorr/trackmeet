import type { AthleteData, EffortType } from '../types'
import './ChartDisplay.css'

interface ChartDisplayProps {
  athlete: AthleteData
  eventId: string
  highlightDice: number | null
  highlightEffort: EffortType | null
}

export function ChartDisplay({ athlete, eventId, highlightDice, highlightEffort }: ChartDisplayProps) {
  const chart = athlete.events[eventId]
  if (!chart) return null

  const diceValues = Array.from({ length: 30 }, (_, i) => i + 10)

  function formatCell(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return ''
    return String(value)
  }

  function getCellClass(dice: number, effort: EffortType): string {
    const classes = ['chart-cell']
    if (highlightDice === dice && highlightEffort === effort) {
      classes.push('highlighted')
    }
    if (highlightDice === dice) {
      classes.push('row-highlight')
    }

    const value = formatCell(chart[String(dice)]?.[effort])
    if (value.startsWith('INJ')) classes.push('cell-injury')
    else if (value === 'FS' || value === 'FS?') classes.push('cell-fs')
    else if (value === 'NG') classes.push('cell-ng')
    else if (value === 'FOUL' || value === '') classes.push('cell-foul')

    return classes.join(' ')
  }

  return (
    <div className="chart-display">
      <div className="chart-table-wrapper">
        <table className="chart-table">
          <thead>
            <tr>
              <th className="col-dice">Dice</th>
              <th className="col-safe">Safe</th>
              <th className="col-avg">Avg</th>
              <th className="col-allout">All Out</th>
            </tr>
          </thead>
          <tbody>
            {diceValues.map(dice => {
              const row = chart[String(dice)]
              if (!row) return null
              const isHighlightRow = highlightDice === dice
              return (
                <tr key={dice} className={isHighlightRow ? 'active-row' : ''}>
                  <td className="col-dice">{dice}</td>
                  <td className={getCellClass(dice, 'safe')}>{formatCell(row.safe)}</td>
                  <td className={getCellClass(dice, 'avg')}>{formatCell(row.avg)}</td>
                  <td className={getCellClass(dice, 'allout')}>{formatCell(row.allout)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
