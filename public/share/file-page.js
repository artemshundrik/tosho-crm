/**
 * Сторінка файлів для замовника /f/<код>: перегляд PDF і «Завантажити все».
 * Звичайний модуль без збирача: сторінку віддає функція, поза застосунком.
 * Без цього скрипта сторінка лишається робочою: видно першу сторінку й кнопку.
 */

const VENDOR = "/share/vendor";
const THUMB_WIDTH_PX = 76;
const RENDERED_PAGES_LIMIT = 16;

const pagesLabel = (count) => {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} сторінок`;
  if (last === 1) return `${count} сторінка`;
  if (last >= 2 && last <= 4) return `${count} сторінки`;
  return `${count} сторінок`;
};

async function setupPdf(root) {
  const pagesEl = root.querySelector("[data-pages]");
  const thumbsEl = root.querySelector("[data-thumbs]");
  const counters = [...document.querySelectorAll("[data-counter]")];
  const countEl = document.querySelector("[data-page-count]");
  const fail = () => {
    const note = root.querySelector("[data-note]");
    if (note) note.hidden = false;
  };

  let doc;
  try {
    const pdfjs = await import(`${VENDOR}/pdf.min.js`);
    pdfjs.GlobalWorkerOptions.workerSrc = `${VENDOR}/pdf.worker.min.js`;
    doc = await pdfjs.getDocument({
      url: root.dataset.src,
      // Кожен шматок файлу ішов би окремим викликом функції, що видає адресу.
      disableRange: true,
      isEvalSupported: false,
      enableScripting: false,
      cMapUrl: `${VENDOR}/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${VENDOR}/standard_fonts/`,
      wasmUrl: `${VENDOR}/wasm/`,
    }).promise;
  } catch (error) {
    console.error("file-page: pdf", error);
    fail();
    return;
  }

  const total = doc.numPages;
  const first = (await doc.getPage(1)).getViewport({ scale: 1 });
  const ratio = `${first.width} / ${first.height}`;
  if (countEl) countEl.textContent = `${countEl.dataset.separator ?? ""}${pagesLabel(total)}`;

  const firstSheet = pagesEl.querySelector("[data-sheet]");
  firstSheet.style.aspectRatio = ratio;
  const slots = [{ el: firstSheet, state: "idle", index: 0 }];
  for (let index = 1; index < total; index += 1) {
    const el = document.createElement("div");
    el.className = "sheet";
    el.style.aspectRatio = ratio;
    pagesEl.append(el);
    slots.push({ el, state: "idle", index });
  }

  let current = 0;
  const wanted = new Set([0]);
  let busy = false;

  const drawTo = async (index, width) => {
    const page = await doc.getPage(index + 1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `Сторінка ${index + 1}`);
    await page.render({ canvas, viewport }).promise;
    page.cleanup();
    return { canvas, ratio: `${base.width} / ${base.height}` };
  };

  const evict = () => {
    const done = slots.filter((slot) => slot.state === "done" && !wanted.has(slot.index));
    const excess = slots.filter((slot) => slot.state === "done").length - RENDERED_PAGES_LIMIT;
    if (excess <= 0) return;
    done
      .sort((a, b) => Math.abs(b.index - current) - Math.abs(a.index - current))
      .slice(0, excess)
      .forEach((slot) => {
        slot.el.replaceChildren();
        slot.state = "idle";
      });
  };

  const pump = async () => {
    if (busy) return;
    busy = true;
    try {
      for (;;) {
        const next = [...wanted]
          .map((index) => slots[index])
          .filter((slot) => slot.state === "idle")
          .sort((a, b) => Math.abs(a.index - current) - Math.abs(b.index - current))[0];
        if (!next) break;
        next.state = "rendering";
        try {
          const density = Math.min(window.devicePixelRatio || 1, 2);
          const drawn = await drawTo(next.index, (next.el.clientWidth || 720) * density);
          next.el.style.aspectRatio = drawn.ratio;
          next.el.replaceChildren(drawn.canvas);
          next.state = "done";
        } catch (error) {
          console.error("file-page: page", error);
          next.state = "failed";
          if (next.index === 0) fail();
        }
        evict();
      }
    } finally {
      busy = false;
    }
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const index = Number(entry.target.dataset.index);
        if (entry.isIntersecting) wanted.add(index);
        else wanted.delete(index);
      }
      void pump();
    },
    { rootMargin: "120% 0px" }
  );
  slots.forEach((slot) => {
    slot.el.dataset.index = String(slot.index);
    observer.observe(slot.el);
  });

  const thumbs = [];
  const showThumbs = total > 1 && window.matchMedia("(min-width: 721px)").matches;
  if (total > 1) root.classList.add("multi");
  if (showThumbs) {
    thumbsEl.hidden = false;
    const smooth = window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
    slots.forEach((slot) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "thumb";
      button.setAttribute("aria-label", `Сторінка ${slot.index + 1}`);
      const paper = document.createElement("span");
      paper.className = "thumb-page";
      paper.style.aspectRatio = ratio;
      const number = document.createElement("span");
      number.textContent = String(slot.index + 1);
      button.append(paper, number);
      button.dataset.index = String(slot.index);
      button.addEventListener("click", () =>
        slot.el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" })
      );
      thumbsEl.append(button);
      thumbs.push({ button, paper, state: "idle" });
    });

    const thumbWanted = new Set();
    let thumbBusy = false;
    const thumbPump = async () => {
      if (thumbBusy) return;
      thumbBusy = true;
      try {
        for (;;) {
          const next = [...thumbWanted].find((index) => thumbs[index].state === "idle");
          if (next === undefined) break;
          thumbs[next].state = "rendering";
          try {
            const drawn = await drawTo(next, THUMB_WIDTH_PX * 2);
            thumbs[next].paper.style.aspectRatio = drawn.ratio;
            thumbs[next].paper.replaceChildren(drawn.canvas);
            thumbs[next].state = "done";
          } catch {
            thumbs[next].state = "failed";
          }
        }
      } finally {
        thumbBusy = false;
      }
    };
    const thumbObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = Number(entry.target.dataset.index);
          if (entry.isIntersecting) thumbWanted.add(index);
          else thumbWanted.delete(index);
        }
        void thumbPump();
      },
      { root: thumbsEl, rootMargin: "200px 0px" }
    );
    thumbs.forEach((thumb) => thumbObserver.observe(thumb.button));
  }

  const showCurrent = () => {
    counters.forEach((counter) => {
      counter.textContent = `${current + 1} / ${total}`;
      counter.hidden = total < 2;
    });
    thumbs.forEach((thumb, index) => {
      if (index === current) thumb.button.setAttribute("aria-current", "page");
      else thumb.button.removeAttribute("aria-current");
    });
    const active = thumbs[current]?.button;
    if (!active) return;
    const box = thumbsEl.getBoundingClientRect();
    const rect = active.getBoundingClientRect();
    if (rect.top < box.top) thumbsEl.scrollTop -= box.top - rect.top + 12;
    else if (rect.bottom > box.bottom) thumbsEl.scrollTop += rect.bottom - box.bottom + 12;
  };

  let frame = 0;
  window.addEventListener(
    "scroll",
    () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const middle = window.innerHeight / 2;
        const hit = slots.find((slot) => {
          const rect = slot.el.getBoundingClientRect();
          return rect.top <= middle && rect.bottom >= middle;
        });
        if (hit && hit.index !== current) {
          current = hit.index;
          showCurrent();
        }
      });
    },
    { passive: true }
  );
  showCurrent();
  void pump();
}

/* ---- «Завантажити все»: один архів без стиснення, макети й так стиснуті. ---- */

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const safeName = (name) => name.replace(/[\\/:*?"<>|\r\n]+/g, "_").trim() || "file";

const uniqueNames = (names) => {
  const seen = new Map();
  return names.map((raw) => {
    const name = safeName(raw);
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return count ? name.replace(/(\.[^.]*)?$/, ` (${count + 1})$1`) : name;
  });
};

function buildZip(entries) {
  const encoder = new TextEncoder();
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [];
  const central = [];
  let offset = 0;

  const header = (size, write) => {
    const bytes = new Uint8Array(size);
    write(new DataView(bytes.buffer));
    return bytes;
  };

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);
    const size = entry.bytes.length;
    const shared = (view, start) => {
      view.setUint16(start, 20, true);
      view.setUint16(start + 2, 0x0800, true); // назва в UTF-8
      view.setUint16(start + 4, 0, true); // без стиснення
      view.setUint16(start + 6, time, true);
      view.setUint16(start + 8, date, true);
      view.setUint32(start + 10, crc, true);
      view.setUint32(start + 14, size, true);
      view.setUint32(start + 18, size, true);
      view.setUint16(start + 22, name.length, true);
    };
    const local = header(30, (view) => {
      view.setUint32(0, 0x04034b50, true);
      shared(view, 4);
    });
    central.push(
      header(46, (view) => {
        view.setUint32(0, 0x02014b50, true);
        view.setUint16(4, 20, true);
        shared(view, 6);
        view.setUint32(42, offset, true);
      }),
      name
    );
    parts.push(local, name, entry.bytes);
    offset += local.length + name.length + size;
  }

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = header(22, (view) => {
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(8, entries.length, true);
    view.setUint16(10, entries.length, true);
    view.setUint32(12, centralSize, true);
    view.setUint32(16, offset, true);
  });
  return new Blob([...parts, ...central, end], { type: "application/zip" });
}

function setupZip(buttons) {
  const setLabel = (text) => buttons.forEach((button) => (button.querySelector("[data-label]").textContent = text));
  const setBusy = (busy) => buttons.forEach((button) => (button.disabled = busy));
  const idleLabel = buttons[0].querySelector("[data-label]").textContent;
  const { base, archive } = buttons[0].dataset;
  const names = uniqueNames(JSON.parse(buttons[0].dataset.files));

  const run = async () => {
    setBusy(true);
    try {
      const entries = [];
      for (let index = 0; index < names.length; index += 1) {
        setLabel(`Збираю ${index + 1} з ${names.length}`);
        const response = await fetch(`${base}/d/${index}`);
        if (!response.ok) throw new Error(String(response.status));
        entries.push({ name: names[index], bytes: new Uint8Array(await response.arrayBuffer()) });
      }
      const url = URL.createObjectURL(buildZip(entries));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeName(archive)}.zip`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setLabel(idleLabel);
    } catch (error) {
      console.error("file-page: zip", error);
      setLabel("Не вдалось, завантажте по одному");
      setTimeout(() => setLabel(idleLabel), 5000);
    } finally {
      setBusy(false);
    }
  };
  buttons.forEach((button) => button.addEventListener("click", () => void run()));
}

const pdfRoot = document.querySelector("[data-pdf]");
if (pdfRoot) void setupPdf(pdfRoot);
const zipButtons = [...document.querySelectorAll("[data-zip]")];
if (zipButtons.length) setupZip(zipButtons);
