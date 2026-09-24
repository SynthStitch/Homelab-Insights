import "./InfoPages.css";

function ContactPage() {
  return (
    <div className="page">
      <header className="info-hero">
        <p className="eyebrow">contact</p>
        <h1>Get in touch.</h1>
        <p className="lede">Questions about setup, the logs and metrics pipelines, or feature ideas.</p>
      </header>

      <section className="panel contact-card rise">
        <div className="panel__head">
          <span className="panel__title">Channels</span>
        </div>
        <ul className="contact-list">
          <li>
            <strong>Email</strong>
            <span>dtrevino2237@gmail.com</span>
          </li>
          <li>
            <strong>Issues</strong>
            <span>
              <a
                href="https://github.com/SynthStitch/Homelab-Insights"
                target="_blank"
                rel="noreferrer"
                className="contact-link"
              >
                GitHub repo
              </a>{" "}
              for bugs and requests
            </span>
          </li>
          <li>
            <strong>Pipelines</strong>
            <span>Share your compose overrides, without secrets, for a quick review.</span>
          </li>
        </ul>
        <p className="fine-print">
          Configuration and log samples stay private. For production environments, redact hostnames
          and IPs before sharing.
        </p>
      </section>
    </div>
  );
}

export default ContactPage;
