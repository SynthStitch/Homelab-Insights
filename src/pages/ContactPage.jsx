import "./InfoPages.css";

function ContactPage() {
  return (
    <div className="info-page">
      <header className="info-hero">
        <p className="eyebrow">Contact</p>
        <h1>Get in touch</h1>
        <p className="lede">
          Have questions about setup, logs/metrics pipelines, or feature ideas?
          Reach out below.
        </p>
      </header>

      <section className="info-card contact-card">
        <h3>Preferred channels</h3>
        <ul className="contact-list">
          <li>
            <strong>Email:</strong> dtrevino2237@gmail.com
          </li>
          <li>
            <strong>Issues:</strong>{" "}
            <a
              href="https://github.com/SynthStitch/Homelab-Insights"
              target="_blank"
              rel="noreferrer"
              className="contact-link"
            >
              GitHub repo
            </a>{" "}
            for bugs/requests
          </li>
          <li>
            <strong>Logs/metrics help:</strong> Share your compose overrides
            (without secrets) for quick review
          </li>
        </ul>
        <p className="fine-print">
          We keep all configuration and log samples private. For production
          environments, redact hostnames/IPs before sharing.
        </p>
      </section>
    </div>
  );
}

export default ContactPage;
