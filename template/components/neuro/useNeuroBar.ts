"use client";
import { useEffect } from "react";

/* Поведение умной строки — vanilla-порт с полным cleanup (StrictMode!).
   Данные ответа захардкожены: прототип, не продукт. */

export const NEURO_REPLY = [
  "За последнюю неделю поступления выросли на 12% — основной вклад дали два контракта.",
  "Ближайшее списание — аренда офиса, послезавтра. На счёте достаточно средств.",
  "Могу подготовить сводку по контрагентам — скажите за какой период.",
];

export function useNeuroBar() {
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>(".nbar");
    const orb = document.querySelector<HTMLElement>(".nbar-orb");
    const input = document.querySelector<HTMLInputElement>(".nbar-input");
    const chat = document.querySelector<HTMLElement>(".nchat");
    const q = document.querySelector<HTMLElement>(".nchat-q");
    const answers = Array.from(
      document.querySelectorAll<HTMLElement>(".nchat-a .rv-block")
    );
    if (!bar || !orb || !input || !chat || !q) return;

    const timers: number[] = [];
    let raf = 0;

    /* ── магнит к курсору (канон-рецепт 11): rAF-троттл, радиус 210 ── */
    const onMove = (e: MouseEvent) => {
      if (raf || bar.classList.contains("open")) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = bar.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const f = Math.max(0, 1 - Math.hypot(dx, dy) / 210);
        bar.style.setProperty("--mx", `${Math.max(-8, Math.min(8, dx * 0.06 * f))}px`);
        bar.style.setProperty("--my", `${Math.max(-6, Math.min(6, dy * 0.06 * f))}px`);
      });
    };
    window.addEventListener("mousemove", onMove);

    /* ── разворот пилюли: обнулить магнит ПЕРЕД pop (keyframe с transform
       перебивает весь transform — канон-рецепт 7) ── */
    const openBar = () => {
      bar.style.setProperty("--mx", "0px");
      bar.style.setProperty("--my", "0px");
      bar.classList.add("open", "pop");
      timers.push(window.setTimeout(() => bar.classList.remove("pop"), 600));
      input.focus();
    };
    orb.addEventListener("click", openBar);

    /* ── чат: blur-стриминг ответа (канон-рецепт 12) ── */
    const openChat = () => {
      const text = input.value.trim() || "Что происходит с деньгами?";
      q.textContent = text;
      answers.forEach((el, i) => {
        el.textContent = NEURO_REPLY[i] ?? "";
        el.classList.remove("in");
      });
      chat.classList.add("open");
      chat.setAttribute("aria-hidden", "false");
      timers.push(window.setTimeout(() => q.classList.add("in"), 100));
      answers.forEach((el, i) => {
        timers.push(window.setTimeout(() => el.classList.add("in"), 600 + i * 450));
      });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && document.activeElement === input) openChat();
      if (e.key === "Escape") {
        // Esc-цепочка: сначала чат, затем сворачивание строки
        if (chat.classList.contains("open")) {
          chat.classList.remove("open");
          chat.setAttribute("aria-hidden", "true");
          q.classList.remove("in");
        } else if (bar.classList.contains("open")) {
          bar.classList.remove("open");
          input.blur();
        }
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("mousemove", onMove);
      orb.removeEventListener("click", openBar);
      document.removeEventListener("keydown", onKey);
      if (raf) cancelAnimationFrame(raf);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);
}
