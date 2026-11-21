import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in / Neo AVO" };

export default function LoginPage() {
  return (
    <div className="login-screen">
      <section className="login-brand" aria-label="Neo AVO">
        <div className="login-wordmark">
          <strong>AVO.</strong>
          <span>
            AUTONOMOUS
            <br />
            VIRTUAL OFFICE
          </span>
        </div>
        <div className="login-pitch">
          <p className="eyebrow">Operations console</p>
          <h1>
            Observe.
            <br />
            Investigate.
            <br />
            Understand.
          </h1>
          <ul className="login-tags" aria-hidden="true">
            <li className="tag-lime">Projects</li>
            <li className="tag-cyan">Incidents</li>
            <li className="tag-purple">Agents</li>
            <li className="tag-orange">Infrastructure</li>
          </ul>
        </div>
        <p className="login-brand-foot">Observe first. Independent by design.</p>
      </section>
      <main className="login-panel">
        <div className="login-card">
          <p className="eyebrow">Operator access</p>
          <h2>Sign in</h2>
          <p className="muted">Use the operator login for this console.</p>
          <LoginForm />
        </div>
        <p className="login-foot">NEO AVO / AUTONOMOUS VIRTUAL OFFICE</p>
      </main>
    </div>
  );
}
