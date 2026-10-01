import { DOT_RADIUS, LANE_WIDTH } from '../lib/graph-utils'
import type { CommitGraphData } from '../lib/types'

const ROW_HEIGHT = 24

interface CommitGraphProps {
  data: CommitGraphData
}

function laneX(lane: number): number {
  return lane * LANE_WIDTH + LANE_WIDTH / 2
}

export function CommitGraph({ data }: CommitGraphProps) {
  const width = (data.maxLane + 1) * LANE_WIDTH
  const cx = laneX(data.dotLane)
  const cy = ROW_HEIGHT / 2

  return (
    <svg width={width} height={ROW_HEIGHT} className='shrink-0' role='img' aria-label='Commit graph'>
      {data.segments.map((seg, i) => {
        const x1 = laneX(seg.topLane)
        const x2 = laneX(seg.bottomLane)
        const y1 = seg.top * ROW_HEIGHT
        const y2 = seg.bottom * ROW_HEIGHT
        const key = `${seg.topLane}-${seg.bottomLane}-${seg.top}-${i}`

        if (seg.topLane === seg.bottomLane) {
          return <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={seg.color} strokeWidth={1.5} />
        }

        const my = (y1 + y2) / 2
        return <path key={key} d={`M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`} fill='none' stroke={seg.color} strokeWidth={1.5} />
      })}
      <circle cx={cx} cy={cy} r={DOT_RADIUS} fill={data.dotColor} stroke='var(--background)' strokeWidth={1.5} />
    </svg>
  )
}

export { ROW_HEIGHT }
