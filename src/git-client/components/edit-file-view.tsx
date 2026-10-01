import { legacy } from '@opencroft/client'

import { Skeleton } from '../ui'

const { CodeEditor } = legacy

interface EditFileViewProps {
  /** null while the initial content is loading. */
  value: string | null
  language: string
  onChange: (value: string) => void
}

/** Full-file editable view. Save/Cancel live in the parent toolbar. */
export function EditFileView({ value, language, onChange }: EditFileViewProps) {
  if (value === null) {
    return (
      <div className='flex h-full flex-col gap-3 p-4'>
        <Skeleton className='h-4 w-1/3' />
        {['a', 'b', 'c', 'd'].map((k) => (
          <Skeleton key={k} className='h-4 w-full' />
        ))}
      </div>
    )
  }
  return <CodeEditor value={value} language={language} height='100%' onChange={onChange} />
}
