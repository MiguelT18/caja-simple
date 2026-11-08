import { useEffect, useRef, useState } from "react";
import { ScanBarcode as ScanIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppDialog } from "../AppDialog";
import { announce } from "@/scripts/dialogs";

// La API del navegador todavía no está en los tipos de TypeScript.
type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
declare global {
  interface Window {
    BarcodeDetector?: new (options: { formats: string[] }) => Detector;
  }
}

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];

/**
 * Lee un código de barras con la cámara del celular y lo pasa a `onScan`. Solo se muestra donde existe
 * BarcodeDetector (Chrome y Edge en Android); en los demás sigue el lector USB, que escribe en el campo.
 * shortcut: BarcodeDetector no existe en Safari/iOS; si hace falta allí, agregar una librería como zxing.
 */
export function ScanBarcode({ onScan }: { onScan: (code: string) => void }) {
  const [supported, setSupported] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  // En un ref: si el padre pasa una función nueva en cada render, la cámara no se reinicia.
  const handler = useRef(onScan);
  handler.current = onScan;

  // Se decide en el navegador: en el servidor no hay window y el botón no debe aparecer de más.
  useEffect(() => setSupported(Boolean(window.BarcodeDetector && navigator.mediaDevices?.getUserMedia)), []);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | undefined;
    let frame = 0;
    let stopped = false;
    const detector = new window.BarcodeDetector!({ formats: FORMATS });

    const scan = async () => {
      if (stopped || !video.current) return;
      if (video.current.readyState >= 2) {
        const [found] = await detector.detect(video.current).catch(() => []);
        const code = found?.rawValue.replace(/\D/g, "");
        if (code && /^\d{6,14}$/.test(code)) {
          navigator.vibrate?.(60);
          announce(`Código leído: ${code}`);
          handler.current(code);
          return setOpen(false);
        }
      }
      frame = requestAnimationFrame(scan);
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then(async (s) => {
        stream = s;
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        video.current!.srcObject = s;
        await video.current!.play();
        frame = requestAnimationFrame(scan);
      })
      .catch(() => setError("No pudimos usar la cámara. Revisa el permiso de la cámara en el navegador."));

    // Al cerrar (o al leer), la cámara se apaga siempre.
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  if (!supported) return null;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11 shrink-0"
        aria-label="Escanear con la cámara"
        title="Escanear con la cámara"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        <ScanIcon />
      </Button>
      <AppDialog title="Escanear código de barras" description="Apunta la cámara al código. Se lee solo." open={open} onOpenChange={setOpen}>
          {error ? (
            <p className="notice notice-error m-0" role="alert">
              {error}
            </p>
          ) : (
            <div className="relative overflow-hidden rounded-lg bg-black">
              <video ref={video} className="aspect-[4/3] w-full object-cover" muted playsInline aria-label="Vista de la cámara" />
              {/* Guía de encuadre: solo decora. */}
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-[12%] top-1/2 h-1/3 -translate-y-1/2 rounded-md border-2 border-white/80" />
            </div>
          )}
      </AppDialog>
    </>
  );
}
