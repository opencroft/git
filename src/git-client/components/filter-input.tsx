import { Search } from 'lucide-react'
import { Input } from '../ui'

interface FilterInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function FilterInput({ value, onChange, placeholder = 'Filter...' }: FilterInputProps) {
  return (
    <div className='relative px-2 py-1'>
      <Search className='absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground' />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className='h-7 pl-7 text-xs' />
    </div>
  )
}
