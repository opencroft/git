import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Textarea } from '../ui'

export interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

export interface PromptOptions {
  title: string
  description?: string
  label?: string
  placeholder?: string
  defaultValue?: string
  confirmLabel?: string
  multiline?: boolean
  required?: boolean
}

export interface ChooseOptions {
  title: string
  description?: string
  options: { value: string; label: string }[]
  confirmLabel?: string
}

interface GitDialogsContextValue {
  confirm: (o: ConfirmOptions) => Promise<boolean>
  prompt: (o: PromptOptions) => Promise<string | null>
  choose: (o: ChooseOptions) => Promise<string | null>
}

const GitDialogsContext = createContext<GitDialogsContextValue | null>(null)

type ActiveDialog = { type: 'confirm'; options: ConfirmOptions } | { type: 'prompt'; options: PromptOptions } | { type: 'choose'; options: ChooseOptions }

export function GitDialogProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<ActiveDialog | null>(null)
  const resolverRef = useRef<((value: unknown) => void) | null>(null)

  const settle = useCallback((value: unknown) => {
    const resolve = resolverRef.current
    resolverRef.current = null
    setActive(null)
    resolve?.(value)
  }, [])

  const open = useCallback((dialog: ActiveDialog) => {
    return new Promise<unknown>((resolve) => {
      resolverRef.current = resolve
      setActive(dialog)
    })
  }, [])

  const confirm = useCallback((options: ConfirmOptions) => open({ type: 'confirm', options }) as Promise<boolean>, [open])

  const prompt = useCallback((options: PromptOptions) => open({ type: 'prompt', options }) as Promise<string | null>, [open])

  const choose = useCallback((options: ChooseOptions) => open({ type: 'choose', options }) as Promise<string | null>, [open])

  // Negative resolution shared by Cancel / Esc / overlay click / close button.
  const cancel = useCallback(() => {
    if (!active) {
      return
    }
    settle(active.type === 'confirm' ? false : null)
  }, [active, settle])

  const value: GitDialogsContextValue = { confirm, prompt, choose }

  return (
    <GitDialogsContext.Provider value={value}>
      {children}
      <Dialog
        open={active !== null}
        onOpenChange={(next) => {
          if (!next) {
            cancel()
          }
        }}
      >
        {active && (
          <DialogContent>
            {active.type === 'confirm' && <ConfirmBody options={active.options} onConfirm={() => settle(true)} onCancel={() => settle(false)} />}
            {active.type === 'prompt' && <PromptBody options={active.options} onConfirm={(text) => settle(text)} onCancel={() => settle(null)} />}
            {active.type === 'choose' && <ChooseBody options={active.options} onChoose={(v) => settle(v)} onCancel={() => settle(null)} />}
          </DialogContent>
        )}
      </Dialog>
    </GitDialogsContext.Provider>
  )
}

export function useGitDialogs(): GitDialogsContextValue {
  const value = useContext(GitDialogsContext)
  if (!value) {
    throw new Error('useGitDialogs must be used within a <GitDialogProvider>')
  }
  return value
}

function ConfirmBody({ options, onConfirm, onCancel }: { options: ConfirmOptions; onConfirm: () => void; onCancel: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{options.title}</DialogTitle>
        {options.description && <DialogDescription>{options.description}</DialogDescription>}
      </DialogHeader>
      <DialogFooter>
        <Button variant='outline' onClick={onCancel}>
          {options.cancelLabel ?? 'Cancel'}
        </Button>
        <Button variant={options.danger ? 'destructive' : 'default'} onClick={onConfirm}>
          {options.confirmLabel ?? 'Confirm'}
        </Button>
      </DialogFooter>
    </>
  )
}

function PromptBody({ options, onConfirm, onCancel }: { options: PromptOptions; onConfirm: (text: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(options.defaultValue ?? '')
  const disabled = !!options.required && value.trim().length === 0

  const submit = () => {
    if (disabled) {
      return
    }
    onConfirm(value)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{options.title}</DialogTitle>
        {options.description && <DialogDescription>{options.description}</DialogDescription>}
      </DialogHeader>
      <div className='flex flex-col gap-1.5'>
        {options.label && <Label>{options.label}</Label>}
        {options.multiline ? (
          <Textarea
            autoFocus
            value={value}
            placeholder={options.placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                submit()
              }
            }}
          />
        ) : (
          <Input
            autoFocus
            value={value}
            placeholder={options.placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
            }}
          />
        )}
      </div>
      <DialogFooter>
        <Button variant='outline' onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={disabled} onClick={submit}>
          {options.confirmLabel ?? 'OK'}
        </Button>
      </DialogFooter>
    </>
  )
}

function ChooseBody({ options, onChoose, onCancel }: { options: ChooseOptions; onChoose: (value: string) => void; onCancel: () => void }) {
  const firstRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    firstRef.current?.focus()
  }, [])

  return (
    <>
      <DialogHeader>
        <DialogTitle>{options.title}</DialogTitle>
        {options.description && <DialogDescription>{options.description}</DialogDescription>}
      </DialogHeader>
      <div className='flex flex-col gap-1'>
        {options.options.map((option, index) => (
          <Button key={option.value} ref={index === 0 ? firstRef : undefined} variant='outline' className='justify-start' onClick={() => onChoose(option.value)}>
            {option.label}
          </Button>
        ))}
      </div>
      <DialogFooter>
        <Button variant='outline' onClick={onCancel}>
          Cancel
        </Button>
      </DialogFooter>
    </>
  )
}
