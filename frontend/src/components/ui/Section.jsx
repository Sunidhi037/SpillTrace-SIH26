import { useState } from "react";
import StagePill from "./StagePill";

/**
 * Panel section with a small uppercase title, an optional stage pill and an
 * optional collapse toggle. `id` is used by the guided "next action" scroll.
 */
export default function Section({
  id,
  title,
  state,
  stateLabel,
  collapsible = false,
  defaultOpen = true,
  aside,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = collapsible ? open : true;

  return (
    <section className="panel-section" data-section={id} id={id ? `section-${id}` : undefined}>
      <header className="panel-section-header">
        {collapsible ? (
          <button
            type="button"
            className="panel-section-toggle"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={isOpen}
          >
            <span className="chevron" aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
            <h2>{title}</h2>
          </button>
        ) : (
          <h2>{title}</h2>
        )}
        <div className="panel-section-meta">
          {aside}
          <StagePill state={state} label={stateLabel} />
        </div>
      </header>
      {isOpen && <div className="panel-section-body">{children}</div>}
    </section>
  );
}
