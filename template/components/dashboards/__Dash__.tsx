import { demoStats } from "@/data/demo";

// Native JSX is the default. Add motion only from an explicit contract.
export default function __DASH_COMPONENT__() {
  return (
    <main className="page chrome-main">
      <div className="page-inner">
        <h1 className="page-title">__DASH_TITLE__</h1>
        <p className="page-sub">Замените содержимое компонентами по макету.</p>
        <div className="demo-grid">
          {demoStats.map((stat) => (
            <section className="demo-card" key={stat.label}>
              <p className="demo-card-v">{stat.value}</p>
              <p className="demo-card-l">{stat.label}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
