import { useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  cleanupPreviousAvatar,
  uploadAvatarVariants,
  type AvatarVariantPaths,
} from "@/features/team/avatarUpload";

const errorText = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

/**
 * Обрізання й заливка фото ЧУЖОГО профілю — з картки людини.
 *
 * ЧОМУ ВІКНО, а не панель, як у власному профілі. У «Моєму акаунті» кадрування
 * розкривається просто в сторінці: там це основна дія екрана. У картці людини
 * фото — дрібниця збоку від даних, і панель, що розсуває сторінку, зсунула б
 * усе, що керівник саме читає. Вікно натомість тримає одну дію й закривається.
 *
 * ЧОГО ТУТ НЕМАЄ НАВМИСНО: запису в профіль. Модуль заливає файли й віддає
 * шляхи, а що з ними робити — вирішує сторінка. Власний профіль додатково
 * оновлює метадані сесії, чужий цього зробити не може: `auth.updateUser`
 * працює лише зі своїм користувачем. Це не втрата — всі поверхні (меню,
 * курсори присутності, списки) читають аватарку СПЕРШУ з довідника, тож
 * залите керівником фото людина побачить у себе так само.
 */
export function AvatarCropDialog({
  imageSrc,
  targetUserId,
  personName,
  previousAvatarPath,
  onClose,
  onUploaded,
}: {
  /** Обрана картинка (object URL). `null` — вікно закрите. */
  imageSrc: string | null;
  targetUserId: string;
  personName: string;
  previousAvatarPath: string | null;
  onClose: () => void;
  onUploaded: (paths: AvatarVariantPaths) => Promise<void> | void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  // Нове фото — новий кадр. Без цього другий файл підряд відкривався з
  // масштабом і зсувом від попереднього, і людина не розуміла, чому обличчя
  // одразу обрізане.
  //
  // Скидання йде ПІД ЧАС рендеру, а не в ефекті. Ефект тут спрацьовував би
  // після того, як React уже намалював нове фото зі старим кадром, — тобто
  // один зайвий кадр із чужим масштабом, який людина встигає побачити. React
  // саме для цього випадку («поле має скинутись, коли змінився проп») радить
  // порівняння з попереднім значенням просто в тілі компонента: рендер
  // переривається й починається наново ще до малювання.
  const [renderedSrc, setRenderedSrc] = useState(imageSrc);
  if (imageSrc && imageSrc !== renderedSrc) {
    setRenderedSrc(imageSrc);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
  }

  const handleSave = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    setBusy(true);
    try {
      const paths = await uploadAvatarVariants({
        userId: targetUserId,
        imageSrc,
        cropArea: croppedAreaPixels,
      });
      await onUploaded(paths);
      cleanupPreviousAvatar(previousAvatarPath, paths);
      toast.success("Фото оновлено");
      onClose();
    } catch (error: unknown) {
      toast.error("Не вдалося оновити фото", {
        description: errorText(error, "Спробуй ще раз."),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={Boolean(imageSrc)}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Фото людини</DialogTitle>
          <DialogDescription>Піджени кадр — це фото побачить уся команда поруч з іменем «{personName}».</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="relative mx-auto h-48 w-48 overflow-hidden rounded-full border border-border bg-background">
            {imageSrc ? (
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_area, areaPixels) => setCroppedAreaPixels(areaPixels)}
              />
            ) : null}
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-caps text-muted-foreground">Масштаб</label>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="w-full accent-primary"
              aria-label="Масштаб фото"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Скасувати
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={busy || !croppedAreaPixels}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? "Завантажую…" : "Зберегти фото"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
