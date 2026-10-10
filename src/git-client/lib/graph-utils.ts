import type { CommitGraphData, GitCommit, GraphSegment } from './types'

const LANE_WIDTH = 14
const DOT_RADIUS = 3.5
const BASE_HUE = 210
const HUE_STEP = 45

function laneColor(lane: number): string {
  return `hsl(${(BASE_HUE + lane * HUE_STEP) % 360}, 65%, 55%)`
}

function firstFreeLane(slots: (string | null)[]): number {
  const free = slots.indexOf(null)
  return free === -1 ? slots.length : free
}

// Assigns lanes top-down (newest to oldest): a commit keeps the leftmost lane
// that a child reserved for it, the first parent continues that lane, and each
// extra (merge) parent opens a new lane. Lanes free up once consumed.
export function computeAllGraphData(commits: GitCommit[]): Map<string, CommitGraphData> {
  const map = new Map<string, CommitGraphData>()
  const slots: (string | null)[] = []

  for (const commit of commits) {
    const incoming: number[] = []
    for (let i = 0; i < slots.length; i++) {
      if (slots[i] === commit.hash) {
        incoming.push(i)
      }
    }

    const dotLane = incoming.length > 0 ? incoming[0] : firstFreeLane(slots)
    const segments: GraphSegment[] = []

    for (let i = 0; i < slots.length; i++) {
      if (slots[i] === null || i === dotLane) {
        continue
      }
      if (slots[i] === commit.hash) {
        segments.push({
          topLane: i,
          bottomLane: dotLane,
          top: 0,
          bottom: 0.5,
          color: laneColor(i),
        })
        slots[i] = null
      } else {
        segments.push({
          topLane: i,
          bottomLane: i,
          top: 0,
          bottom: 1,
          color: laneColor(i),
        })
      }
    }

    if (incoming.length > 0) {
      segments.push({
        topLane: dotLane,
        bottomLane: dotLane,
        top: 0,
        bottom: 0.5,
        color: laneColor(dotLane),
      })
    }

    const [firstParent, ...mergeParents] = commit.parents
    if (firstParent) {
      slots[dotLane] = firstParent
      segments.push({
        topLane: dotLane,
        bottomLane: dotLane,
        top: 0.5,
        bottom: 1,
        color: laneColor(dotLane),
      })
    } else {
      slots[dotLane] = null
    }

    for (const parentHash of mergeParents) {
      const lane = firstFreeLane(slots)
      slots[lane] = parentHash
      segments.push({
        topLane: dotLane,
        bottomLane: lane,
        top: 0.5,
        bottom: 1,
        color: laneColor(lane),
      })
    }

    let maxLane = dotLane
    for (const segment of segments) {
      maxLane = Math.max(maxLane, segment.topLane, segment.bottomLane)
    }

    map.set(commit.hash, {
      dotLane,
      dotColor: laneColor(dotLane),
      segments,
      maxLane,
    })
  }

  return map
}

export { DOT_RADIUS, LANE_WIDTH }
