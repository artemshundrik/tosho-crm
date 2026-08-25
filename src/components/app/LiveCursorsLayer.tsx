import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/auth/AuthProvider";
import { LiveCursors, type LiveCursor } from "@/components/app/live-cursors";
import { useDemoCursors } from "@/components/app/useDemoCursors";
import { useWorkspacePresence } from "@/components/app/workspace-presence-context";
import { supabase } from "@/lib/supabaseClient";

/**
 * ЖИВІ КУРСОРИ КОЛЕГ — ПІДПИСКА Й МАЛЮВАННЯ В ОДНОМУ МІСЦІ (REQ-163).
 *
 * ЧОМУ ЦЕ ОКРЕМИЙ КОМПОНЕНТ, А НЕ ХУК У СТОРІНЦІ. Це не смак, а єдиний спосіб
 * не покласти дошку. Координати чужих мишей приходять близько десяти разів на
 * секунду ВІД КОЖНОГО, і якби вони лежали в стані сторінки, кожен рух чужої
 * руки перемальовував би «Дизайн» цілком — сторінку на дванадцять тисяч рядків.
 * Тут стан замкнений у крихітному піддереві: рухаються курсори, а не дошка.
 * Той самий висновок уже записаний про прапорці в тілі сторінок-гігантів.
 *
 * КОЛИ КАНАЛ НЕ ВІДКРИВАЄТЬСЯ ВЗАГАЛІ. Коли на сторінці людина сама. Це не
 * дрібна економія: більшість часу кожен сидить у розділі один, і платити за
 * канал, у якому нікому слухати, немає за що. Про те, чи є тут іще хтось, уже
 * знає присутність — питаємо в неї, а не відкриваємо канал, щоб перевірити.
 *
 * ЩО САМЕ ЛЕТИТЬ ПО МЕРЕЖІ — НЕ ПІКСЕЛІ, А КАРТКА. Пікселі брешуть: у людей
 * різні екрани, різна ширина колонок і своя прокрутка, тож точка (340, 210) на
 * двох машинах — це різні картки. Тому відправник шукає картку під курсором і
 * шле її ключ плюс частку всередині неї, а приймач переводить це у свої
 * координати. Тоді стрілка стоїть на ТІЙ САМІЙ картці, хоч би як у когось було
 * прокручено. Коли під курсором картки немає — шлемо частку від вікна, це
 * запасний, приблизний шлях.
 */

/** Як часто відправник шле координати, поки миша рухається. */
const SEND_EVERY_MS = 90;

/** Менший зсув не шлемо: тремтіння руки — не новина. */
const MIN_MOVE_PX = 3;

/** Не чули від людини стільки — прибираємо її курсор. */
const PEER_TIMEOUT_MS = 8000;

/** Миша стоїть довше — вважаємо, що людина читає, і замовкаємо. */
const IDLE_AFTER_MS = 1500;

type CursorPayload = {
  id: string;
  name: string;
  avatarUrl: string | null;
  /** Ключ картки під курсором (`data-kanban-row`) або null. */
  anchor: string | null;
  /** Частка всередині картки, а без картки — частка від вікна. */
  nx: number;
  ny: number;
};

type Peer = CursorPayload & { seenAt: number };

/**
 * Лічильник повідомлень — щоб рішення про частоту ухвалювали за числами.
 *
 * Живе на `window` навмисно: заміряти треба на живій роботі, а не в тесті, і
 * дістати число має бути можна з консолі в будь-який момент, нічого не
 * вмикаючи наперед.
 */
type CursorStats = { sent: number; received: number; since: number };
declare global {
  interface Window {
    __toshoCursorStats?: CursorStats;
  }
}

function bumpStat(key: "sent" | "received") {
  if (typeof window === "undefined") return;
  const stats = (window.__toshoCursorStats ??= { sent: 0, received: 0, since: Date.now() });
  stats[key] += 1;
}

type LiveCursorsLayerProps = {
  /** Усі, хто на цій сторінці, мають збігтися в одному каналі. */
  pageKey: string;
  /** Показ із привидами замість живих людей. */
  demo?: boolean;
};

export function LiveCursorsLayer({ pageKey, demo = false }: LiveCursorsLayerProps) {
  const { teamId, userId } = useAuth();
  const presence = useWorkspacePresence();
  const demoCursors = useDemoCursors(demo);

  const others = presence.activeHereEntries.filter((entry) => !entry.isSelf);
  const hasCompany = others.length > 0;
  const enabled = !demo && Boolean(teamId) && Boolean(userId) && hasCompany;

  const [cursors, setCursors] = useState<LiveCursor[]>([]);
  const peers = useRef(new Map<string, Peer>());

  const self = presence.activeHereEntries.find((entry) => entry.isSelf);
  const selfName = self?.displayName ?? "Колега";
  const selfAvatar = self?.avatarUrl ?? null;
  const selfRef = useRef({ name: selfName, avatarUrl: selfAvatar });
  selfRef.current = { name: selfName, avatarUrl: selfAvatar };

  useEffect(() => {
    if (!enabled || !teamId || !userId) {
      peers.current.clear();
      setCursors([]);
      return;
    }

    const channel = supabase.channel(`cursors:${teamId}:${pageKey}`, {
      config: { broadcast: { self: false } },
    });
    // Копія посилання на мапу для прибирання: до моменту, коли ефект
    // згортається, `peers.current` уже може вказувати на інший об'єкт.
    const peerMap = peers.current;

    /** Перевести те, що прийшло, у координати ЦЬОГО екрана. */
    const resolve = (peer: Peer): LiveCursor | null => {
      if (peer.anchor) {
        const node = document.querySelector<HTMLElement>(
          `[data-kanban-row="${CSS.escape(peer.anchor)}"]`
        );
        if (node) {
          const rect = node.getBoundingClientRect();
          // Картка може бути прокручена геть — тоді курсор не малюємо взагалі,
          // бо показувати його на краю екрана означало б брехати про місце.
          if (rect.bottom < 0 || rect.top > window.innerHeight) return null;
          return {
            id: peer.id,
            name: peer.name,
            avatarUrl: peer.avatarUrl,
            x: Math.round(rect.left + rect.width * peer.nx),
            y: Math.round(rect.top + rect.height * peer.ny),
          };
        }
        // Картки з таким ключем у нас немає (інший фільтр, інша сторінка
        // прокрутки) — мовчимо, а не показуємо навмання.
        return null;
      }
      return {
        id: peer.id,
        name: peer.name,
        avatarUrl: peer.avatarUrl,
        x: Math.round(peer.nx * window.innerWidth),
        y: Math.round(peer.ny * window.innerHeight),
      };
    };

    const redraw = () => {
      const now = Date.now();
      const alive: LiveCursor[] = [];
      peers.current.forEach((peer, key) => {
        if (now - peer.seenAt > PEER_TIMEOUT_MS) {
          peers.current.delete(key);
          return;
        }
        const resolved = resolve(peer);
        if (resolved) alive.push(resolved);
      });
      setCursors(alive);
    };

    channel.on("broadcast", { event: "cursor" }, ({ payload }) => {
      const incoming = payload as CursorPayload;
      if (!incoming?.id || incoming.id === userId) return;
      bumpStat("received");
      peers.current.set(incoming.id, { ...incoming, seenAt: Date.now() });
      redraw();
    });

    channel.on("broadcast", { event: "cursor-left" }, ({ payload }) => {
      const leaving = payload as { id?: string };
      if (!leaving?.id) return;
      peers.current.delete(leaving.id);
      redraw();
    });

    void channel.subscribe();

    let lastSentAt = 0;
    let lastX = -9999;
    let lastY = -9999;
    let idleTimer: number | null = null;
    let sentSinceIdle = false;

    const send = (x: number, y: number) => {
      // Картку під курсором шукаємо від елемента під точкою, а не від події:
      // так це працює і тоді, коли миша над вкладеною кнопкою чи аватаркою.
      const target = document.elementFromPoint(x, y);
      const row = target instanceof Element ? target.closest<HTMLElement>("[data-kanban-row]") : null;
      let payload: CursorPayload;
      if (row) {
        const rect = row.getBoundingClientRect();
        payload = {
          id: userId,
          name: selfRef.current.name,
          avatarUrl: selfRef.current.avatarUrl,
          anchor: row.dataset.kanbanRow ?? null,
          nx: rect.width ? (x - rect.left) / rect.width : 0.5,
          ny: rect.height ? (y - rect.top) / rect.height : 0.5,
        };
      } else {
        payload = {
          id: userId,
          name: selfRef.current.name,
          avatarUrl: selfRef.current.avatarUrl,
          anchor: null,
          nx: x / Math.max(1, window.innerWidth),
          ny: y / Math.max(1, window.innerHeight),
        };
      }
      bumpStat("sent");
      sentSinceIdle = true;
      void channel.send({ type: "broadcast", event: "cursor", payload });
    };

    const handleMove = (event: PointerEvent) => {
      const now = Date.now();
      if (Math.abs(event.clientX - lastX) < MIN_MOVE_PX && Math.abs(event.clientY - lastY) < MIN_MOVE_PX) {
        return;
      }
      if (now - lastSentAt < SEND_EVERY_MS) return;
      lastSentAt = now;
      lastX = event.clientX;
      lastY = event.clientY;
      send(event.clientX, event.clientY);

      // Миша спинилась — замовкаємо. Саме тут і живе основна економія: людина
      // читає значно довше, ніж возить рукою.
      if (idleTimer) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        idleTimer = null;
      }, IDLE_AFTER_MS);
    };

    const handleLeave = () => {
      if (!sentSinceIdle) return;
      void channel.send({ type: "broadcast", event: "cursor-left", payload: { id: userId } });
      sentSinceIdle = false;
    };

    window.addEventListener("pointermove", handleMove, { passive: true });
    // Прокрутка й зміна розміру не шлють нічого — вони лише переставляють ЧУЖІ
    // курсори, бо картки під ними поїхали.
    window.addEventListener("scroll", redraw, { passive: true, capture: true });
    window.addEventListener("resize", redraw);
    window.addEventListener("blur", handleLeave);

    const prune = window.setInterval(redraw, 2000);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("scroll", redraw, true);
      window.removeEventListener("resize", redraw);
      window.removeEventListener("blur", handleLeave);
      if (idleTimer) window.clearTimeout(idleTimer);
      window.clearInterval(prune);
      handleLeave();
      void supabase.removeChannel(channel);
      peerMap.clear();
      setCursors([]);
    };
  }, [enabled, pageKey, teamId, userId]);

  return <LiveCursors cursors={demo ? demoCursors : cursors} />;
}
