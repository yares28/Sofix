import { Chevron } from "./Chevron";

/** The quiet "go further" action at the foot of a bento card. */
export function CardLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className="card-link" onClick={onClick}>
      {children}
      <Chevron direction="right" size={12} />
    </button>
  );
}
