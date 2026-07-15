import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "@/lib/supabaseClient";

// Voice dictation hook. Records audio with MediaRecorder, ships it to the
// `transcribe` Netlify function, and hands the resulting text back via `onResult`.
// Batch flow only (record → stop → transcribe); no realtime streaming.

export type DictationState = "idle" | "recording" | "transcribing" | "error";

export type DictationContext = "brief" | "comment";

type UseDictationOptions = {
  context: DictationContext;
  onResult: (text: string) => void;
  clean?: boolean;
  /** Auto-stop after this many ms so a forgotten recording can't grow unbounded. */
  maxDurationMs?: number;
};

type TranscribeResponse = {
  raw?: string;
  cleaned?: string;
  error?: string;
};

const DEFAULT_MAX_DURATION_MS = 5 * 60 * 1000;

// Prefer opus; fall back for Safari, which only records mp4/aac.
function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Не вдалося прочитати аудіо"));
    reader.onloadend = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      // Strip the `data:<mime>;base64,` prefix.
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

export function useDictation(options: UseDictationOptions) {
  const { context, onResult, clean = true, maxDurationMs = DEFAULT_MAX_DURATION_MS } = options;

  const [state, setState] = useState<DictationState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("audio/webm");
  const cancelledRef = useRef(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef<number>(0);
  // Keep the latest onResult without forcing consumers to memoize it.
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const isSupported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";

  const clearTimers = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  const transcribe = useCallback(
    async (blob: Blob) => {
      setState("transcribing");
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          throw new Error("Сесія протермінована — увійдіть знову.");
        }

        const audioBase64 = await blobToBase64(blob);
        const response = await fetch("/.netlify/functions/transcribe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            audioBase64,
            mimeType: mimeTypeRef.current,
            context,
            clean,
          }),
        });

        const raw = await response.text();
        let parsed: TranscribeResponse = {};
        if (raw) {
          try {
            parsed = JSON.parse(raw) as TranscribeResponse;
          } catch {
            parsed = { error: raw };
          }
        }
        if (!response.ok) {
          throw new Error(parsed.error || "Не вдалося розпізнати голос");
        }

        const text = (parsed.cleaned || parsed.raw || "").trim();
        if (text) {
          onResultRef.current(text);
        }
        setState("idle");
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Не вдалося розпізнати голос";
        setError(message);
        setState("error");
      }
    },
    [context, clean]
  );

  const start = useCallback(async () => {
    if (!isSupported || state === "recording" || state === "transcribing") return;
    setError(null);
    cancelledRef.current = false;
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Дозвольте доступ до мікрофона");
      setState("error");
      return;
    }

    const mimeType = pickMimeType();
    mimeTypeRef.current = mimeType || "audio/webm";
    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setError("Запис аудіо не підтримується в цьому браузері");
      setState("error");
      return;
    }

    streamRef.current = stream;
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      clearTimers();
      releaseStream();
      if (cancelledRef.current) {
        setState("idle");
        return;
      }
      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
      chunksRef.current = [];
      if (blob.size === 0) {
        setState("idle");
        return;
      }
      void transcribe(blob);
    };

    recorder.start();
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setState("recording");
    tickRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 200);
    autoStopRef.current = setTimeout(() => {
      recorderRef.current?.stop();
    }, maxDurationMs);
  }, [isSupported, state, clearTimers, releaseStream, transcribe, maxDurationMs]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    } else {
      clearTimers();
      releaseStream();
      setState("idle");
    }
  }, [clearTimers, releaseStream]);

  // Tear down on unmount so a dangling recorder can't keep the mic hot.
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      clearTimers();
      if (recorderRef.current?.state === "recording") {
        try {
          recorderRef.current.stop();
        } catch {
          /* noop */
        }
      }
      releaseStream();
    };
  }, [clearTimers, releaseStream]);

  return { state, elapsedMs, error, isSupported, start, stop, cancel };
}
