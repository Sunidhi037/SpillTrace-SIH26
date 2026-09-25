import { useState } from "react";
import Section from "../ui/Section";
import { ErrorNotice, LoadingNotice } from "../ui/Feedback";
import DriftControls from "./DriftControls";
import { DEFAULT_PARAMS } from "./driftDefaults";
import DriftResultCard from "./DriftResultCard";

export default function DriftPanel({
  hindcastStage,
  forecastStage,
  hindcastResult,
  forecastResult,
  hindcastLoading,
  forecastLoading,
  hindcastError,
  forecastError,
  blockedReason,
  layers,
  onRun,
  onShow,
  onToggleLayer,
}) {
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const update = (field, value) => setParams((prev) => ({ ...prev, [field]: value }));

  // One pill for the section: running > failed > complete(both/one) > ready/blocked
  const states = [hindcastStage.state, forecastStage.state];
  const sectionState = states.includes("running")
    ? "running"
    : states.every((s) => s === "complete")
      ? "complete"
      : states.every((s) => s === "blocked")
        ? "blocked"
        : "ready";
  const sectionLabel =
    sectionState === "ready" && states.includes("complete") ? "PARTIAL" : undefined;

  return (
    <Section id="drift" title="DRIFT ANALYSIS" state={sectionState} stateLabel={sectionLabel}>
      <DriftControls
        params={params}
        onChange={update}
        onRunHindcast={() => onRun("hindcast", params)}
        onRunForecast={() => onRun("forecast", params)}
        hindcastLoading={hindcastLoading}
        forecastLoading={forecastLoading}
        hindcastDone={!!hindcastResult}
        forecastDone={!!forecastResult}
        blockedReason={blockedReason}
      />

      {hindcastLoading && (
        <LoadingNotice
          title="Running hindcast…"
          lines={["Moving particles backward from the slick", "Building origin corridor"]}
        />
      )}
      {hindcastError && (
        <ErrorNotice
          title="HINDCAST FAILED"
          message="The origin reconstruction could not be completed."
          reason={hindcastError}
          onRetry={() => onRun("hindcast", params)}
        />
      )}
      <DriftResultCard
        kind="hindcast"
        result={hindcastResult}
        layerVisible={layers.hindcastOrigin}
        onShow={() => onShow("hindcast")}
        onToggleLayer={() => onToggleLayer("hindcastOrigin")}
      />

      {forecastLoading && (
        <LoadingNotice
          title="Running forecast…"
          lines={["Advecting particles forward from the slick", "Building forecast corridor"]}
        />
      )}
      {forecastError && (
        <ErrorNotice
          title="FORECAST FAILED"
          message="The forecast simulation could not be completed."
          reason={forecastError}
          onRetry={() => onRun("forecast", params)}
        />
      )}
      <DriftResultCard
        kind="forecast"
        result={forecastResult}
        layerVisible={layers.forecastCorridor}
        onShow={() => onShow("forecast")}
        onToggleLayer={() => onToggleLayer("forecastCorridor")}
      />
    </Section>
  );
}
