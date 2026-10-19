import { Fragment, type ReactNode } from "react";
import type { SpecNode } from "../../plan/types";

function PageShell({ title, nav = [], children }: any) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">ACME</div>
        {nav.map((item: string) => (
          <div className="nav-item" key={item}>
            {item}
          </div>
        ))}
      </aside>
      <main className="content">
        <header className="header">
          <h1>{title}</h1>
        </header>
        {children}
      </main>
    </div>
  );
}

function Section({ children }: any) {
  return <section className="section">{children}</section>;
}

function FilterBar({ placeholder, action }: any) {
  return (
    <div className="filter-bar">
      <div className="search">{placeholder}</div>
      <button className="primary-button">{action}</button>
    </div>
  );
}

function DataTable({ columns, rows = 3 }: any) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          {columns.map((column: string) => (
            <th key={column}>{column}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }, (_, rowIndex) => (
          <tr key={rowIndex}>
            {columns.map((column: string) => (
              <td key={column}>
                示例 {rowIndex + 1}-{column}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MobileShell({ title, tabs = [], children }: any) {
  return (
    <div className="mobile-shell">
      <header className="mobile-header">
        <h1>{title}</h1>
      </header>
      <main className="mobile-content">{children}</main>
      <nav className="bottom-nav">
        {tabs.map((tab: string) => (
          <div key={tab}>{tab}</div>
        ))}
      </nav>
    </div>
  );
}

function FeedCard({ title, body }: any) {
  return (
    <article className="feed-card">
      <div className="cover" />
      <h2>{title}</h2>
      <p>{body}</p>
    </article>
  );
}

function Icon({ name }: any) {
  return (
    <svg
      className="icon"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-label={name}
    >
      <path d="M6 4h12v16l-6-4-6 4V4z" />
    </svg>
  );
}

const registry: Record<string, (props: any) => ReactNode> = {
  PageShell,
  Section,
  FilterBar,
  DataTable,
  MobileShell,
  FeedCard,
  ICON: Icon,
};

export function renderSpec(node: SpecNode): ReactNode {
  const Component = registry[node.type];
  if (!Component) return null;
  const children = node.children?.map((child, index) => (
    <Fragment key={index}>{renderSpec(child)}</Fragment>
  ));
  return <Component {...(node.props ?? {})}>{children}</Component>;
}
