import MarketingHeader from './marketing-header';

function ArrowIcon() {
  return (
    <svg aria-hidden="true" className="marketing-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg aria-hidden="true" className="service-row__icon-art" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 3.75h7l4 4v12.5h-11z" />
      <path d="M13.5 3.75v4h4M9.5 12h5M9.5 15.5h5" />
    </svg>
  );
}

function ReturnIcon() {
  return (
    <svg aria-hidden="true" className="service-row__icon-art" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18.5 8.5v-4h-4" />
      <path d="M18.25 4.75 13.5 9.5a6.25 6.25 0 1 0 1.75 7.5" />
      <path d="M10 12.5h4M10 15.5h2.5" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg aria-hidden="true" className="faq-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export default function HomePage() {
  return (
    <div className="marketing">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <MarketingHeader />

      <main id="main-content">
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

          <div className="print-preview" role="group" aria-labelledby="print-preview-title">
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
          </div>
        </section>

        <section className="about-section marketing-section" id="about" aria-labelledby="about-title">
          <div className="about-section__copy">
            <h2 id="about-title">Document services, in one clear place.</h2>
            <p>QuickDoc brings print-and-deliver and document-service requests together in one customer workspace.</p>
            <p>Choose a service, share the details, and keep track of your requests from your account.</p>
          </div>
          <div className="about-section__details">
            <div>
              <strong>Print to your specifications</strong>
              <span>Select paper size, colour, sides and finishing options for your PDF.</span>
            </div>
            <div>
              <strong>See the next step</strong>
              <span>Review a quote and available options before placing a print request.</span>
            </div>
            <div>
              <strong>Keep requests together</strong>
              <span>Manage orders, saved documents, delivery addresses and account details.</span>
            </div>
          </div>
        </section>

        <section className="marketing-section" id="services" aria-labelledby="services-title">
          <div className="marketing-section__intro">
            <h2 id="services-title">Two ways to move a document forward.</h2>
            <p>Start with the service that fits, then manage the request from one customer workspace.</p>
          </div>
          <div className="service-list">
            <article className="service-row">
              <span className="service-row__icon" aria-hidden="true"><DocumentIcon /></span>
              <div>
                <h3>Print &amp; Deliver</h3>
                <p>Upload a PDF, choose print details, get a quote and select an eligible nearby shop.</p>
              </div>
              <a href="/register" aria-label="Create an account to start Print and Deliver">Start a print request <ArrowIcon /></a>
            </article>
            <article className="service-row">
              <span className="service-row__icon service-row__icon--return" aria-hidden="true"><ReturnIcon /></span>
              <div>
                <h3>Attest &amp; Return</h3>
                <p>Review document services, requirements and return steps available for your request.</p>
              </div>
              <a href="/register" aria-label="Create an account to explore Attest and Return">Explore availability <ArrowIcon /></a>
            </article>
          </div>
          <p className="service-list__note">Attest &amp; Return services depend on what is configured and available for your area.</p>
        </section>

        <section className="steps-section marketing-section" id="how-it-works" aria-labelledby="steps-title">
          <div className="marketing-section__intro">
            <h2 id="steps-title">A simple path from PDF to request.</h2>
            <p>Know what to prepare and what happens before you place an order.</p>
          </div>
          <ol className="step-list">
            <li>
              <span className="step-list__number">01</span>
              <h3>Upload your PDF</h3>
              <p>Start with the document you need printed.</p>
            </li>
            <li>
              <span className="step-list__number">02</span>
              <h3>Choose print options</h3>
              <p>Set paper size, colour, sides and finishing preferences.</p>
            </li>
            <li>
              <span className="step-list__number">03</span>
              <h3>Review and place</h3>
              <p>Check the quote and available shop options, then submit your request.</p>
            </li>
          </ol>
        </section>

        <section className="testimonials-section marketing-section" id="testimonials" aria-labelledby="testimonials-title">
          <div className="testimonials-section__intro">
            <h2 id="testimonials-title">Customer stories</h2>
            <p>We do not have verified customer testimonials to share yet. This space is reserved for genuine experiences.</p>
          </div>
          <a className="marketing-text-link" href="#services">Explore QuickDoc services <ArrowIcon /></a>
        </section>

        <section className="faq-section marketing-section" id="faq" aria-labelledby="faq-title">
          <div className="marketing-section__intro">
            <h2 id="faq-title">A few things to know.</h2>
            <p>Clear answers to help you choose the right next step.</p>
          </div>
          <div className="faq-list">
            <details>
              <summary>What do I need to start a print request?<ChevronIcon /></summary>
              <p>Have your PDF ready. You can then choose print options, review a quote and select from eligible shops available for your request.</p>
            </details>
            <details>
              <summary>Are Attest &amp; Return services available everywhere?<ChevronIcon /></summary>
              <p>Availability depends on the services configured for your area. QuickDoc does not determine legal eligibility for document attestation.</p>
            </details>
            <details>
              <summary>Where can I manage my requests?<ChevronIcon /></summary>
              <p>Your QuickDoc account brings orders, saved documents, delivery addresses and account details together.</p>
            </details>
          </div>
        </section>

        <section className="account-section" id="account" aria-labelledby="account-title">
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
        <nav className="marketing-footer__links" aria-label="Footer navigation">
          <a href="#about">About</a>
          <a href="#services">Services</a>
          <a href="#faq">FAQs</a>
          <a href="/login">Sign in</a>
        </nav>
      </footer>
    </div>
  );
}
