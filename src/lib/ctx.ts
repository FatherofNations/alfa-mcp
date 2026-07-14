/* Контекст запуска сервера. Файловые тулы ведут себя по-разному:
   - stdio (сервер на машине агента): пишут файлы напрямую, cwd = корень
     проекта агента;
   - http (командный хостинг): файлов агента не видят — отдают контент
     и/или готовые curl-команды (скаффолд — тарболом через /dl,
     обработка ассетов — round-trip через /process). */

export interface ServerCtx {
  mode: "stdio" | "http";
  /** http: базовый URL сервера (из Host-заголовка запроса) */
  baseUrl: string;
  /** http: регистрирует файл для скачивания, возвращает полный URL */
  publish: (filePath: string, name: string) => string;
  /** http: URL эндпоинта пост-процессинга ассетов */
  processUrl: string;
}

export const stdioCtx: ServerCtx = {
  mode: "stdio",
  baseUrl: "",
  publish: () => {
    throw new Error("publish недоступен в stdio-режиме");
  },
  processUrl: "",
};
