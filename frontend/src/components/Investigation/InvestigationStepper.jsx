import { STAGE_LABEL } from "../../utils/stages";

const ORDER = ["detection", "hindcast", "forecast", "ais", "ranking"];
const ICON = { complete: "✓", running: "", failed: "!", ready: "→", blocked: "○" };

/** Compact workflow tracker: ✓ DETECT → HINDCAST → FORECAST → AIS → RANK */
export default function InvestigationStepper({ stages, next, onGo }) {
  return (
    <ol className="stepper" aria-label="Investigation progress">
      {ORDER.map((key) => {
        const state = stages[key].state;
        const isNext = next?.stage === key;
        return (
          <li key={key} className={`step step-${state} ${isNext ? "is-next" : ""}`}>
            <button
              type="button"
              onClick={() => onGo(key)}
              title={stages[key].reason || `${STAGE_LABEL[key]}: ${state}`}
            >
              <span className="step-icon" aria-hidden="true">
                {state === "running" ? <span className="spinner spinner-xs" /> : ICON[state]}
              </span>
              {STAGE_LABEL[key].toUpperCase()}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
