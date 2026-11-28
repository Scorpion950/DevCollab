export default function ProjectSectionLoading() {
  return (
    <div className="form-stack" aria-busy="true" aria-label="Loading project workspace">
      <div className="skeleton" style={{ height: "4rem", width: "100%" }} />
      <div className="skeleton" style={{ height: "2.75rem", width: "100%" }} />
      <div className="stat-grid">
        <div className="skeleton" style={{ height: "5.25rem" }} />
        <div className="skeleton" style={{ height: "5.25rem" }} />
        <div className="skeleton" style={{ height: "5.25rem" }} />
      </div>
      <div className="skeleton" style={{ height: "14rem", width: "100%" }} />
    </div>
  );
}
