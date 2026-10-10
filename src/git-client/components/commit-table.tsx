import { LANE_WIDTH } from '../lib/graph-utils'
import type { CommitGraphData, GitCommit } from '../lib/types'
import { ScrollArea } from '../ui'
import { CommitRow } from './commit-row'

interface CommitTableProps {
  commits: GitCommit[]
  graphData: Map<string, CommitGraphData>
  headHash: string | undefined
  headReachable: Set<string>
  selectedHash: string | undefined
  onSelect: (hash: string) => void
}

export function CommitTable({ commits, graphData, headHash, headReachable, selectedHash, onSelect }: CommitTableProps) {
  return (
    <div className='flex flex-col flex-1 min-h-0'>
      <div className='flex items-center border-b py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider bg-card'>
        <span className='flex-1' style={{ paddingLeft: LANE_WIDTH }}>
          Commit
        </span>
        <span className='w-28 shrink-0 px-2'>Author</span>
        <span className='w-16 shrink-0 px-2'>Hash</span>
        <span className='w-36 shrink-0 px-2'>Date</span>
      </div>
      <ScrollArea className='flex-1 min-h-0' innerClassName='block min-w-0!'>
        <div className='p-1'>
          {commits.map((commit) => {
            const gd = graphData.get(commit.hash)
            if (!gd) {
              return null
            }
            return (
              <CommitRow
                key={commit.hash}
                commit={commit}
                graphData={gd}
                isHead={commit.hash === headHash}
                isSelected={commit.hash === selectedHash}
                dimmed={!headReachable.has(commit.hash)}
                onSelect={onSelect}
              />
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
