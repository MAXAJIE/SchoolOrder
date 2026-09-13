import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useI18n } from "@/lib/i18n";

type CropImage = {
  element: HTMLImageElement;
  mime: string;
  name: string;
};

/**
 * Draws the visible crop. The source rectangle always has the SAME aspect ratio
 * as the destination canvas, so the picture is never squashed and the preview
 * shows exactly what will be saved — the saved file then fits its display box
 * with no letterboxing and nothing cut off unexpectedly.
 */
function drawCrop(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  zoom: number,
  offsetX: number,
  offsetY: number,
  aspect: number,
) {
  const iw = image.naturalWidth;
  const ih = image.naturalHeight;
  if (!iw || !ih) return;

  // Largest rectangle of the target ratio that fits in the source, then zoomed.
  let sourceW = iw / ih > aspect ? ih * aspect : iw;
  let sourceH = sourceW / aspect;
  sourceW = Math.min(iw, sourceW / zoom);
  sourceH = Math.min(ih, sourceH / zoom);

  const maxX = Math.max(0, (iw - sourceW) / 2);
  const maxY = Math.max(0, (ih - sourceH) / 2);
  const centerX = iw / 2 + offsetX * maxX;
  const centerY = ih / 2 + offsetY * maxY;
  const sx = Math.max(0, Math.min(iw - sourceW, centerX - sourceW / 2));
  const sy = Math.max(0, Math.min(ih - sourceH, centerY - sourceH / 2));

  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, sx, sy, sourceW, sourceH, 0, 0, canvas.width, canvas.height);
}

function croppedName(name: string, mime: string) {
  const extension = mime.split("/")[1] === "jpeg" ? "jpg" : (mime.split("/")[1] ?? "jpg");
  return `${name.replace(/\.[^.]+$/, "")}-cropped.${extension}`;
}

export function ImageCropper({
  file,
  aspect = 1,
  onCancel,
  onComplete,
}: {
  file: File | null;
  /** width / height of the box the image will be shown in. 1 = square. */
  aspect?: number;
  onCancel: () => void;
  onComplete: (file: File) => void;
}) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<CropImage | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  const previewWidth = 480;
  const previewHeight = Math.round(previewWidth / aspect);
  const outputWidth = 1200;
  const outputHeight = Math.round(outputWidth / aspect);

  useEffect(() => {
    if (!file) {
      setImage(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const element = new Image();
    element.onload = () => setImage({ element, mime: file.type, name: file.name });
    element.src = url;
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (image && canvasRef.current) {
      drawCrop(canvasRef.current, image.element, zoom, offsetX, offsetY, aspect);
    }
  }, [image, zoom, offsetX, offsetY, aspect]);

  function complete() {
    if (!image) return;
    const output = document.createElement("canvas");
    output.width = outputWidth;
    output.height = outputHeight;
    drawCrop(output, image.element, zoom, offsetX, offsetY, aspect);
    const mime =
      image.mime === "image/png" || image.mime === "image/webp" ? image.mime : "image/jpeg";
    output.toBlob(
      (blob) => {
        if (blob) onComplete(new File([blob], croppedName(image.name, mime), { type: mime }));
      },
      mime,
      0.92,
    );
  }

  return (
    <Dialog open={Boolean(file)} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("image.crop")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <canvas
            ref={canvasRef}
            width={previewWidth}
            height={previewHeight}
            className="w-full rounded-lg border bg-muted"
          />
          <p className="text-xs text-muted-foreground">{t("image.fitNote")}</p>
          <div className="grid gap-2">
            <Label>{t("image.zoom")}</Label>
            <Slider
              min={1}
              max={3}
              step={0.05}
              value={[zoom]}
              onValueChange={(v) => setZoom(v[0] ?? 1)}
            />
          </div>
          <div className="grid gap-2">
            <Label>{t("image.horizontal")}</Label>
            <Slider
              min={-1}
              max={1}
              step={0.05}
              value={[offsetX]}
              onValueChange={(v) => setOffsetX(v[0] ?? 0)}
            />
          </div>
          <div className="grid gap-2">
            <Label>{t("image.vertical")}</Label>
            <Slider
              min={-1}
              max={1}
              step={0.05}
              value={[offsetY]}
              onValueChange={(v) => setOffsetY(v[0] ?? 0)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={complete} disabled={!image}>
            {t("image.useCrop")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
