import "./InfoPages.css";

const faqs = [
  {
    q: "What data does it collect?",
    a: "Metrics and snapshots from the sources you configure: Proxmox nodes and VMs today, plus Docker, OTEL and Loki via the compose stacks. Everything stays in your environment.",
  },
  {
    q: "Do I need Proxmox?",
    a: "No. You can start Docker-only: run the Loki/Promtail stack for logs and the OTEL collector for metrics.",
  },
  {
    q: "Can I add more sources?",
    a: "Yes. Add OTEL receivers or Promtail scrape targets to bring in Kubernetes, bare metal, or cloud VMs.",
  },
];

const stories = [
  {
    title: "As a homelab admin",
    body: "I want unified metrics from Proxmox and Docker so I can see CPU, memory, and uptime without jumping across UIs.",
    done: ["Proxmox polling", "Loki/Promtail compose", "Dashboard charts"],
  },
  {
    title: "As a troubleshooter",
    body: "I want logs searchable in one place so I can correlate spikes to container restarts or VM events.",
    done: ["Loki + Promtail", "Alert tester", "Copilot with snapshot context"],
  },
  {
    title: "As the owner",
    body: "I want role-based access and node management so only authorized users can add or remove telemetry sources.",
    done: ["JWT auth with roles", "Admin console", "Ping-before-save for nodes"],
  },
];

function LearnPage() {
  return (
    <div className="page">
      <header className="info-hero">
        <p className="eyebrow">how it works</p>
        <h1>Metrics, logs, alerts and a copilot, in one place.</h1>
        <p className="lede">
          A quick tour of what Homelab Insights does and who it is for. Use it to brief anyone you
          share the lab with.
        </p>
      </header>

      <section className="info-grid">
        {stories.map((story, index) => (
          <article key={story.title} className="panel info-card rise" style={{ "--d": `${index * 80}ms` }}>
            <div className="panel__head">
              <span className="panel__title">Story 0{index + 1}</span>
            </div>
            <h3>{story.title}</h3>
            <p>{story.body}</p>
            <div className="pill-row">
              {story.done.map((item) => (
                <span key={item} className="pill">
                  {item}
                </span>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="panel">
        <div className="panel__head">
          <span className="panel__title">FAQ</span>
        </div>
        <div className="faq-list">
          {faqs.map((faq) => (
            <details key={faq.q} className="faq-item">
              <summary>{faq.q}</summary>
              <p>{faq.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

export default LearnPage;
