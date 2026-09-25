import CandidateCard from "./CandidateCard";

function CandidateList({ candidates, selectedCandidateId, onSelect }) {
  if (!candidates || candidates.length === 0) {
    return <p className="muted">No candidates were returned for this run.</p>;
  }

  return (
    <div className="candidate-list">
      {candidates.map((candidate, index) => (
        <CandidateCard
          key={candidate.candidate_id}
          candidate={candidate}
          isSelected={candidate.candidate_id === selectedCandidateId}
          expanded={index === 0}
          onSelect={() => onSelect(candidate.candidate_id)}
        />
      ))}
    </div>
  );
}

export default CandidateList;
