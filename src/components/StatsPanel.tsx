import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { WCAG_TIERS } from "@/lib/wcag"
import type { AnalysisStats } from "@/lib/imageProcessing"

interface StatsPanelProps {
  stats: AnalysisStats
}

function fmt(n: number): string {
  return n.toLocaleString()
}

function pct(n: number): string {
  return n.toFixed(1) + "%"
}

export function StatsPanel({ stats }: StatsPanelProps) {
  const { counts, percentages, totalPixels } = stats

  return (
    <div className="flex flex-col gap-4">
      {/* Stacked progress bar */}
      <div
        className="flex h-4 w-full overflow-hidden rounded-full"
        title="Distribution of pixels by WCAG tier"
        role="img"
        aria-label="Stacked bar showing WCAG tier distribution"
      >
        {WCAG_TIERS.map((tier) => {
          const pctVal = percentages[tier.level]
          if (pctVal < 0.1) return null
          return (
            <div
              key={tier.level}
              style={{
                width: `${pctVal}%`,
                background: tier.heatmapColor,
              }}
              title={`${tier.label}: ${pct(pctVal)}`}
            />
          )
        })}
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tier</TableHead>
            <TableHead>Ratio range</TableHead>
            <TableHead className="text-right">Pixels</TableHead>
            <TableHead className="text-right">%</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {WCAG_TIERS.map((tier) => (
            <TableRow key={tier.level}>
              <TableCell>
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block size-3 flex-shrink-0 rounded-sm"
                    style={{ background: tier.heatmapColor }}
                  />
                  <span className="font-medium">{tier.label}</span>
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground font-mono text-xs">
                {tier.ratioRange}
              </TableCell>
              <TableCell className="text-right font-mono text-xs">
                {fmt(counts[tier.level])}
              </TableCell>
              <TableCell className="text-right font-mono text-xs">
                {pct(percentages[tier.level])}
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="border-t-2">
            <TableCell colSpan={2} className="font-semibold">
              Total
            </TableCell>
            <TableCell className="text-right font-mono text-xs font-semibold">
              {fmt(totalPixels)}
            </TableCell>
            <TableCell className="text-right font-mono text-xs">
              100%
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  )
}
