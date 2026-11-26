import { Bot, Braces, Check, GitBranch, GitPullRequest, UserRound } from "lucide-react";
import styles from "./workspace-illustration.module.css";

export function WorkspaceIllustration() {
  return (
    <figure className={styles.scene} aria-label="Sample workspace showing a TypeScript patch prepared by an agent for human review">
      <div className={styles.editor}>
        <div className={styles.bar}><Braces size={17} /><strong>Atlas API</strong><span className={styles.branch}><GitBranch size={13} /> feat/tracing</span></div>
        <div className={styles.file}><b>TS</b> src / trace.ts</div>
        <ol className={styles.source} aria-label="TypeScript source code">
          <li><code><i>export function</i> <b>trace</b>(</code></li>
          <li><code>  req: <em>Request</em></code></li>
          <li><code>) {"{"}</code></li>
          <li><code>  <i>const</i> id = req.headers</code></li>
          <li><code>    .get(<em>&quot;x-trace-id&quot;</em>);</code></li>
          <li><code>  <i>return</i> id ?? crypto.<b>randomUUID</b>();</code></li>
          <li><code>{"}"}</code></li>
        </ol>
      </div>
      <div className={styles.run}>
        <div className={styles.cap}><Bot size={17} /> AI execution</div>
        <strong>Prepare tracing patch</strong>
        <ul>{["Source updated", "Tests passed", "Patch prepared"].map(action =>
          <li key={action}><Check size={13} />{action}</li>
        )}</ul>
      </div>
      <div className={styles.review}>
        <GitPullRequest size={23} strokeWidth={1.5} />
        <div><div className={styles.cap}>Code review</div><strong>Request tracing</strong>
        <span className={styles.reviewer}><UserRound size={13} /> Mira K. · Review requested</span></div>
      </div>
    </figure>
  );
}
