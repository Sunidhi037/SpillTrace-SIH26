const STEPS = [
  { n: "01", label: "UPLOAD" },
  { n: "02", label: "DETECT" },
  { n: "03", label: "INVESTIGATE" },
];

/** 01 UPLOAD → 02 DETECT → 03 INVESTIGATE. `active` is 1..3; earlier steps show ✓. */
export default function WorkflowSteps({ active }) {
  return (
    <ol className="workflow-steps" aria-label="Workflow">
      {STEPS.map((step, i) => {
        const idx = i + 1;
        const state = idx < active ? "done" : idx === active ? "active" : "todo";
        return (
          <li key={step.n} className={`wf-step wf-${state}`} aria-current={state === "active" ? "step" : undefined}>
            <span className="wf-num">{state === "done" ? "✓" : step.n}</span>
            <span className="wf-label">{step.label}</span>
            {idx < STEPS.length && <span className="wf-arrow" aria-hidden="true">→</span>}
          </li>
        );
      })}
    </ol>
  );
}
