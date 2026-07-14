/* Реестр дашбордов — единственный источник списка для панели tools,
   свопов и deep-links. Новые дашборды добавляет тул register_dashboard. */

export interface DashboardDef {
  id: string; // ключ (совпадает с сегментом пути; главная — "main")
  route: string; // путь роута ("/", "/reports", …)
  title: string; // заголовок карточки в панели
  subtitle: string; // подзаголовок карточки
}

export const DASHBOARDS: DashboardDef[] = [
  /* proto-forge:dashboards */
];

export function dashboardByPath(pathname: string | null): DashboardDef {
  const p = pathname ?? "/";
  return (
    DASHBOARDS.find((d) => d.route !== "/" && p.startsWith(d.route)) ??
    DASHBOARDS[0]
  );
}
