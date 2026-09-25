import Section from "../ui/Section";
import { Checklist, LoadingNotice, SuccessLine } from "../ui/Feedback";
import CandidateBlocked from "./CandidateBlocked";
import CandidateList from "./CandidateList";
import { featureCount } from "../../utils/investigation";

export default function CandidatePanel({
  stage,
  prerequisites,
  run,
  loading,
  error,
  errorDetails,
  aisTracks,
  selectedCandidateId,
  onRank,
  onSelect,
}) {
  const state = stage.state;
  const candidates = run?.candidates || [];
  const analyzed = featureCount(aisTracks);
  const showResults = run && !error && !loading;

  return (
    <Section id="candidates" title="CANDIDATE ANALYSIS" state={state}>
      {loading && (
        <LoadingNotice
          title="Ranking candidate vessels…"
          lines={["Scoring spatial, temporal and behavioral evidence", "Building ranked list"]}
        />
      )}

      {!loading && error && (
        <CandidateBlocked reason={error} details={errorDetails} onRetry={onRank} />
      )}

      {!loading && !error && !run && (
        <>
          <Checklist items={prerequisites} />
          {state === "ready" && <p className="muted">Ready to evaluate vessel compatibility.</p>}
          {state === "blocked" && <p className="prereq-note">{stage.reason}</p>}
          <button
            type="button"
            className="btn btn-primary"
            onClick={onRank}
            disabled={state !== "ready"}
          >
            RANK CANDIDATES
          </button>
          <small className="hint">
            Scores compatible vessel tracks against available spatial, temporal and behavioral evidence.
          </small>
        </>
      )}

      {showResults && (
        <>
          <SuccessLine>
            {candidates.length} candidate {candidates.length === 1 ? "vessel" : "vessels"} ranked
            {analyzed > 0 ? ` · ${analyzed} AIS ${analyzed === 1 ? "track" : "tracks"} loaded` : ""}
          </SuccessLine>

          <CandidateList
            candidates={candidates}
            selectedCandidateId={selectedCandidateId}
            onSelect={onSelect}
          />

          <button type="button" className="btn btn-ghost btn-sm" onClick={onRank}>
            Re-rank candidates
          </button>
        </>
      )}
    </Section>
  );
}
