'use client'

import { useShareSafe } from '@/app/components/ShareSafeProvider'
import { maskShareSafeNotification } from '@/app/lib/shareSafe'
import { useToast } from '@/hooks/use-toast'
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast'

export function Toaster() {
  const { toasts } = useToast()
  const { shareSafeMode } = useShareSafe()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        const masked = maskShareSafeNotification(shareSafeMode, {
          title,
          description,
        })

        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {masked.title && <ToastTitle>{masked.title}</ToastTitle>}
              {masked.description && (
                <ToastDescription>{masked.description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
