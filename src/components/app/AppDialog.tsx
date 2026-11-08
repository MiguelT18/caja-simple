import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

// Anchos de la app: un poco más holgados que los de shadcn, así los formularios no se aprietan.
const WIDTHS = { sm: "sm:max-w-lg", md: "sm:max-w-xl", lg: "sm:max-w-2xl", xl: "sm:max-w-3xl" } as const;

/**
 * El diálogo de las islas React de /app: título, descripción, ancho estándar y scroll propio si no cabe.
 * Abierto siempre con `onClose` (se monta al abrir), o controlado con `open`/`onOpenChange`, o con `trigger`.
 * La columna es minmax(0, 1fr): ningún contenido largo lo ensancha ni lo desborda.
 */
export function AppDialog({
  title,
  description,
  size = "md",
  open,
  onOpenChange,
  onClose,
  trigger,
  className,
  contentProps,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  size?: keyof typeof WIDTHS;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  /** Botón que lo abre (DialogTrigger asChild). */
  trigger?: ReactNode;
  className?: string;
  contentProps?: Omit<ComponentProps<typeof DialogContent>, "className" | "children">;
  children: ReactNode;
}) {
  const controlled = open ?? (trigger ? undefined : true);
  return (
    <Dialog open={controlled} onOpenChange={(next) => (onOpenChange?.(next), !next && onClose?.())}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent {...contentProps} className={cn("max-h-[calc(100dvh-2rem)] grid-cols-[minmax(0,1fr)] overflow-y-auto", WIDTHS[size], className)}>
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="[overflow-wrap:anywhere]">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
