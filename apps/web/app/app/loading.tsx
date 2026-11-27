export default function WorkspaceLoading() {
  return (
    <div className="form-stack" aria-busy="true" aria-label="Loading workspace">
      <div className="skeleton" style={{ height: "4.5rem", width: "100%" }} />
      <div className="stat-grid">
        <div className="skeleton" style={{ height: "5.5rem" }} />
        <div className="skeleton" style={{ height: "5.5rem" }} />
        <div className="skeleton" style={{ height: "5.5rem" }} />
        <div className="skeleton" style={{ height: "5.5rem" }} />
      </div>
      <div className="skeleton" style={{ height: "16rem", width: "100%" }} />
    </div>
  );
}
