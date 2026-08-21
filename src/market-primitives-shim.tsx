/* eslint-disable @typescript-eslint/no-explicit-any */
import { Button as HeroButton, Chip, Input as HeroInput, Spinner } from '@heroui/react'
export type MenuEntry = any

export function Button({ children, onClick, onPress, variant, size, icon, isDisabled, ...rest }: any) {
  const handler = onPress ?? onClick
  return (
    <HeroButton size={size ?? 'sm'} variant={variant ?? 'secondary'} isDisabled={isDisabled} onPress={handler} {...rest}>
      {icon}
      {children}
    </HeroButton>
  )
}
export function DisclosureRow({ children, title, description, icon, onClick }: any) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-divider px-3 py-2 hover:bg-default-50 cursor-pointer" onClick={onClick}>
      <div className="flex items-center gap-2">
        {icon}
        <div>
          <div className="text-sm font-medium">{title}</div>
          {description ? <div className="text-xs text-default-500">{description}</div> : null}
        </div>
      </div>
      <div>{children}</div>
    </div>
  )
}
export const IconChevronDownOutline14 = (_props: any) => <span>▼</span>
export const IconChevronLeftOutline14 = (_props: any) => <span>‹</span>
export const IconChevronRightOutline14 = (_props: any) => <span>›</span>
export const IconChevronUpOutline14 = (_props: any) => <span>▲</span>
export const IconCheckOutline16 = (_props: any) => <span>✓</span>
export const IconCodeOutline16 = (_props: any) => <span>{'</>'}</span>
export const IconCordisPluginOutline14 = (_props: any) => <span>◆</span>
export const IconDownloadOutline16 = (_props: any) => <span>↓</span>
export const IconFolderOpen16 = (_props: any) => <span>📁</span>
export const IconLinkOutline14 = (_props: any) => <span>🔗</span>
export const IconLoadingOutline16 = (_props: any) => <Spinner size="sm" />
export const IconQuestionOutline14 = (_props: any) => <span>?</span>
export const IconRefreshOutline14 = (_props: any) => <span>↻</span>
export const IconSearchOutline16 = (_props: any) => <span>🔍</span>
export const IconSparkle16 = (_props: any) => <span>✦</span>
export const IconWarningOutline16 = (_props: any) => <span>⚠</span>

export function Input(props: any) {
  return <HeroInput {...props} />
}
export function Menu({ anchor, children, open, onClose }: any) {
  if (!open) return anchor ?? null
  return (
    <div className="relative">
      {anchor}
      <div className="absolute right-0 z-20 mt-1 min-w-48 rounded-lg border border-divider bg-content1 p-1 shadow-lg">
        <div onClick={onClose}>{children}</div>
      </div>
    </div>
  )
}
export function Modal({ children, isOpen }: any) {
  if (!isOpen) return null
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="max-h-[90vh] overflow-auto rounded-lg bg-content1 p-4">{children}</div></div>
}
export function Pill({ children, color }: any) {
  return <Chip size="sm" variant="soft" color={color ?? 'default'}>{children}</Chip>
}
export function StateDot({ state }: any) {
  const color = state === 'done' ? 'success' : state === 'warning' ? 'warning' : 'danger'
  return <Chip size="sm" variant="soft" color={color as any}>{state}</Chip>
}
export function Toast(props: any) {
  return <div className="fixed bottom-4 right-4 z-50 rounded bg-content1 p-2 shadow">{props.children}</div>
}
export function Tooltip({ children }: any) {
  return <span>{children}</span>
}
