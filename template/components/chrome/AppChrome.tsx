/* Базовый хром страницы: боковое меню (fixed слева, 248) + шапка (fixed
   сверху, 56). Перенесён 1:1 из проверенного дашборда (nefor-dash /current,
   Figma 132:34616 / 195:25832), классы переименованы cur-* → chrome-*,
   шрифт меню — medium (по решению команды). Серверный компонент — разметка
   статична, поведение (active-состояния и т.п.) навешивается по месту.

   Контент страницы кладите в <main className="page chrome-main"> —
   отступы под сайдбар и шапку даёт chrome.css. Пункты меню и данные шапки
   меняйте под прототип прямо здесь. */

const A = "/assets/chrome/";

const NAV_TOP = [
  { icon: "nav-all.svg", label: "Все сервисы", dim: false },
  { icon: "nav-bonus.svg", label: "Альфа-Выгодно", dim: false },
] as const;

const NAV_MAIN = [
  { icon: "nav-pay.svg", label: "Новый платёж" },
  { icon: "nav-feed.svg", label: "Лента операций" },
  { icon: "nav-progress.svg", label: "Платежи в работе" },
  { icon: "nav-import.svg", label: "Импорт реестров" },
  { icon: "nav-statement.svg", label: "Выписка" },
  { icon: "nav-accounts.svg", label: "Счета" },
  { icon: "nav-contragents.svg", label: "Контрагенты" },
  { icon: "nav-cards.svg", label: "Карты" },
  { icon: "nav-pay.svg", label: "Эквайринг и касса" },
] as const;

export default function AppChrome() {
  return (
    <>
      {/* ═══ Боковое меню ═══ */}
      <aside className="chrome-side">
        <div className="chrome-logo">
          <img src={`${A}logo.svg`} width="248" height="64" alt="Альфа-Бизнес" />
          <img className="chrome-logo-grad" src={`${A}logo-grad.webp`} width="248" height="8" alt="" />
        </div>

        <nav className="chrome-nav">
          {NAV_TOP.map((n) => (
            <a className="chrome-cell" key={n.label}>
              <span className="chrome-ico">
                <img src={`${A}${n.icon}`} width="20" height="20" alt="" />
              </span>
              <span className="chrome-cell-t">{n.label}</span>
            </a>
          ))}
          <div className="chrome-div">
            <i />
          </div>
          {NAV_MAIN.map((n) => (
            <a className="chrome-cell" key={n.label}>
              <span className="chrome-ico dim">
                <img src={`${A}${n.icon}`} width="20" height="20" alt="" />
              </span>
              <span className="chrome-cell-t">{n.label}</span>
            </a>
          ))}
          <div className="chrome-div">
            <i />
          </div>
          <a className="chrome-cell chrome-cell-proc">
            <span className="chrome-ico dim">
              <img src={`${A}nav-procurement.svg`} width="20" height="20" alt="" />
              <img className="chrome-proc-border" src={`${A}nav-proc-border.webp`} width="32" height="32" alt="" />
            </span>
            <span className="chrome-cell-t">Госзакупки</span>
          </a>
        </nav>

        <div className="chrome-footer">
          <div className="chrome-footer-fade" />
          <a className="chrome-cell chrome-footer-cell">
            <span className="chrome-ico dim">
              <img src={`${A}nav-gear.svg`} width="20" height="20" alt="" />
            </span>
            <span className="chrome-cell-t">Настроить меню</span>
          </a>
        </div>
      </aside>

      {/* ═══ Шапка ═══ */}
      <header className="chrome-header">
        <div className="chrome-hbtns">
          <button className="chrome-hbtn" aria-label="Письма">
            <img src={`${A}hdr-mail.svg`} width="20" height="20" alt="" />
          </button>
          <button className="chrome-hbtn" aria-label="Уведомления">
            <img src={`${A}hdr-bell.svg`} width="20" height="20" alt="" />
          </button>
        </div>
        <span className="chrome-hdiv" />
        <div className="chrome-company">
          <span className="chrome-co-logo" />
          <span className="chrome-co-info">
            <b>ООО «Город Нагатино»</b>
            <i>Набоков И.Д.</i>
          </span>
        </div>
        <span className="chrome-hdiv" />
        <button className="chrome-person">
          <span className="chrome-person-av" />
          <span className="chrome-person-t">Предприниматель</span>
        </button>
        <span className="chrome-hdiv" />
        <button className="chrome-hbtn" aria-label="Выйти">
          <img src={`${A}hdr-exit.svg`} width="20" height="20" alt="" />
        </button>
      </header>
    </>
  );
}
