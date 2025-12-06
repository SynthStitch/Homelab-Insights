import "./InfoPages.css";

const faqs = [
  {
    q: "What data do we collect?",
    a: "Metrics, logs, and snapshots you configure (Proxmox, Docker, OTEL). Everything stays in your environment by default.",
  },
  {
    q: "Do I need Proxmox?",
    a: "No. You can start with Docker-only: run the Loki/Promtail stack for logs and the OTEL collector for metrics.",
  },
  {
    q: "Can I extend sources?",
    a: "Yes. Add more OTEL receivers or Promtail scrape targets to bring in Kubernetes, bare metal, or cloud VMs.",
  },
];

const stories = [
  {
    title: "As a homelab admin",
    body: "I want unified metrics from Proxmox and Docker so I can see CPU, memory, and uptime without jumping across UIs.",
    done: ["Proxmox polling", "Docker compose for Loki/Promtail", "Dashboard visualizations"],
  },
  {
    title: "As a troubleshooting user",
    body: "I want logs searchable in one place so I can quickly correlate spikes to container restarts or VM events.",
    done: ["Loki + Promtail compose", "Alert tester UI", "AI assistant context on recent snapshots/logs"],
  },
  {
    title: "As an admin",
    body: "I want RBAC and node CRUD so only authorized users can add/remove telemetry sources.",
    done: ["JWT auth with roles", "Admin console for users/nodes", "API ping-before-save for new nodes"],
  },
];

function LearnPage() {
  return (
    <div className="info-page">
      <header className="info-hero">
        <p className="eyebrow">Learn more</p>
        <h1>Homelab Insights overview</h1>
        <p className="lede">
          How metrics, logs, alerts, and AI assistant come together. Use this as a quick tour or to brief
          stakeholders.
        </p>
      </header>

      <section className="info-grid">
        {stories.map((story) => (
          <article key={story.title} className="info-card">
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

      <section className="info-faq">
        <h2>FAQ</h2>
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
