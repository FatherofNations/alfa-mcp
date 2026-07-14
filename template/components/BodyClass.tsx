"use client";
import { useEffect } from "react";

/* Вешает класс на <body> на время жизни роута (снимает в cleanup).
   Для page-specific скоупа CSS-правил, когда правило должно жить на body. */
export default function BodyClass({ name }: { name: string }) {
  useEffect(() => {
    document.body.classList.add(name);
    return () => document.body.classList.remove(name);
  }, [name]);
  return null;
}
