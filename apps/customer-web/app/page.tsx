function ArrowIcon() {
  return (
    <svg aria-hidden="true" className="marketing-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <div className="marketing">
      <header className="marketing-nav">
        <a className="marketing-brand" href="/" aria-label="QuickDoc home">
          <img src="/logo/quickdoc-logo.svg" alt="QuickDoc" />
        </a>
        <nav className="marketing-nav__links" aria-label="Main navigation">
          <a href="#services">Services</a>
          <a href="#how-it-works">How it works</a>
          <a href="/login">Sign in</a>
          <a className="marketing-button marketing-button--small" href="/register">Create account</a>
        </nav>
      </header>

      <main>
        <section className="marketing-hero">
          <h1>Print the way your document needs.</h1>
          <p className="marketing-hero__copy">
            Upload a PDF, choose your print options and arrange delivery from an eligible print shop.
            Explore document return services in the same QuickDoc account.
          </p>
          <div className="marketing-hero__actions">
            <a className="marketing-button" href="/register">Create your account <ArrowIcon /></a>
            <a className="marketing-text-link" href="#services">Explore services</a>
          </div>

          <section className="print-preview" aria-labelledby="print-preview-title">
            <div className="print-preview__heading">
              <div>
                <h2 id="print-preview-title">Set up your print</h2>
                <p>Choose the details that work for your document.</p>
              </div>
              <span className="print-preview__note">Example options</span>
            </div>
            <dl className="print-specs">
              <div className="print-spec">
                <dt>Paper size</dt>
                <dd>A4</dd>
                <span>Also A3 and A5</span>
              </div>
              <div className="print-spec">
                <dt>Colour</dt>
                <dd>Black &amp; white</dd>
                <span>Or full colour</span>
              </div>
              <div className="print-spec">
                <dt>Sides</dt>
                <dd>Single-sided</dd>
                <span>Or double-sided</span>
              </div>
              <div className="print-spec print-spec--finish">
                <dt>Finishing</dt>
                <dd>Binding, stapling</dd>
                <span>And lamination options</span>
              </div>
            </dl>
            <p className="print-preview__footnote">Options and delivery depend on the eligible print shops available for your request.</p>
          </section>
        </section>

        <section className="marketing-section" id="services" aria-labelledby="services-title">
          <div className="marketing-section__intro">
            <h2 id="services-title">Two ways to move a document forward.</h2>
            <p>Start with the service that fits, then manage the request from one customer workspace.</p>
          </div>
          <div className="service-list">
            <article className="service-row">
              <span className="service-row__index" aria-hidden="true">A</span>
              <div>
                <h3>Print &amp; Deliver</h3>
                <p>Upload a PDF, choose print details, get a quote and select an eligible nearby shop.</p>
              </div>
              <a href="/register" aria-label="Create an account to start Print and Deliver">Start a print request <ArrowIcon /></a>
            </article>
            <article className="service-row">
              <span className="service-row__index" aria-hidden="true">B</span>
              <div>
                <h3>Attest &amp; Return</h3>
                <p>Review document services, requirements and return steps available for your request.</p>
              </div>
              <a href="/register" aria-label="Create an account to explore Attest and Return">Explore availability <ArrowIcon /></a>
            </article>
          </div>
          <p className="service-list__note">Attest &amp; Return services depend on what is configured and available for your area.</p>
        </section>

        <section className="account-section" id="how-it-works" aria-labelledby="account-title">
          <div>
            <h2 id="account-title">Your requests, in one place.</h2>
            <p>Keep track of orders, saved documents, delivery addresses and account details in your QuickDoc workspace.</p>
          </div>
          <a className="marketing-button marketing-button--light" href="/register">Get started <ArrowIcon /></a>
        </section>
      </main>

      <footer className="marketing-footer">
        <a className="marketing-brand" href="/" aria-label="QuickDoc home">
          <img src="/logo/quickdoc-logo.svg" alt="QuickDoc" />
        </a>
        <p>Print and document services, made easier to manage.</p>
        <a href="/login">Sign in to your account</a>
      </footer>
    </div>
  );
}
