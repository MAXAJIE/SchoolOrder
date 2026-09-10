import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useI18n } from "@/lib/i18n";

type CropImage = {
  element: HTMLImageElement;
  mime: string;
  name: string;
};

function drawCrop(canvas: HTMLCanvasElement, image: HTMLImageElement, zoom: number, offsetX: number, offsetY: number) {
  const size = canvas.width;
  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight) / zoom;
  const maxX = Math.max(0, (image.naturalWidth - sourceSize) / 2);
  const maxY = Math.max(0, (image.naturalHeight - sourceSize) / 2);
  const centerX = image.naturalWidth / 2 + offsetX * maxX;
  const centerY = image.naturalHeight / 2 + offsetY * maxY;
  const sx = Math.max(0, Math.min(image.naturalWidth - sourceSize, centerX - sourceSize / 2));
  const sy = Math.max(0, Math.min(image.naturalHeight - sourceSize, centerY - sourceSize / 2));
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, size, size);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, sx, sy, sourceSize, sourceSize, 0, 0, size, size);
}

function croppedName(name: string, mime: string) {
  const extension = mime.split("/")[1] === "jpeg" ? "jpg" : mime.split("/")[1] ?? "jpg";
  return `${name.replace(/\.[^.]+$/, "")}-cropped.${extension}`;
}

export function ImageCropper({
  file,
  onCancel,
  onComplete,
}: {
  file: File | null;
  onCancel: () => void;
  onComplete: (file: File) => void;
}) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<CropImage | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

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
    if (image && canvasRef.current) drawCrop(canvasRef.current, image.element, zoom, offsetX, offsetY);
  }, [image, zoom, offsetX, offsetY]);

  function complete() {
    if (!image || !canvasRef.current) return;
    const output = document.createElement("canvas");
    output.width = 1200;
    output.height = 1200;
    drawCrop(output, image.element, zoom, offsetX, offsetY);
    const mime = image.mime === "image/png" || image.mime === "image/webp" ? image.mime : "image/jpeg";
    output.toBlob((blob) => {
      if (blob) onComplete(new File([blob], croppedName(image.name, mime), { type: mime }));
    }, mime, 0.92);
  }

  return (
    <Dialog open={Boolean(file)} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("image.crop")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <canvas ref={canvasRef} width={480} height={480} className="w-full rounded-lg border bg-muted" />
          <div className="grid gap-2">
            <Label>{t("image.zoom")}</Label>
            <Slider min={1} max={3} step={0.05} value={[zoom]} onValueChange={(v) => setZoom(v[0] ?? 1)} />
          </div>
          <div className="grid gap-2">
            <Label>{t("image.horizontal")}</Label>
            <Slider min={-1} max={1} step={0.05} value={[offsetX]} onValueChange={(v) => setOffsetX(v[0] ?? 0)} />
          </div>
          <div className="grid gap-2">
            <Label>{t("image.vertical")}</Label>
            <Slider min={-1} max={1} step={0.05} value={[offsetY]} onValueChange={(v) => setOffsetY(v[0] ?? 0)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>{t("common.cancel")}</Button>
          <Button type="button" onClick={complete} disabled={!image}>{t("image.useCrop")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
