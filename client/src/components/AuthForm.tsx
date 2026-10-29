import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, type FieldError } from "../api/client";
import { useAuth } from "../auth";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [busy, setBusy] = useState(false);
  const isRegister = mode === "register";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors([]);
    try {
      if (isRegister) await register(form.name, form.email, form.password);
      else await login(form.email, form.password);
      navigate("/");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.details);
      } else setError("Network error, is the API running?");
    } finally {
      setBusy(false);
    }
  }

  const fieldError = (f: string) => fieldErrors.find((e) => e.field === f)?.message;
  const field = (name: "name" | "email" | "password", label: string, type = "text") => (
    <label className="field">
      <span>{label}</span>
      <input
        name={name}
        type={type}
        value={form[name]}
        autoComplete={name === "password" ? (isRegister ? "new-password" : "current-password") : name}
        aria-invalid={!!fieldError(name)}
        onChange={(e) => setForm({ ...form, [name]: e.target.value })}
      />
      {fieldError(name) && <small className="error">{fieldError(name)}</small>}
    </label>
  );

  return (
    <main className="auth">
      <form className="card" onSubmit={onSubmit} noValidate>
        <div className="brand">WalletLens</div>
        <h1>{isRegister ? "Create your account" : "Sign in"}</h1>
        <p className="muted">Explain a transaction and check its risk before you sign. Read-only, testnets only.</p>
        {error && (
          <div role="alert" className="alert">
            {error}
          </div>
        )}
        {isRegister && field("name", "Name")}
        {field("email", "Email", "email")}
        {field("password", "Password", "password")}
        <button className="primary" disabled={busy}>
          {busy ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
        </button>
        <p className="muted small">
          {isRegister ? (
            <>
              Already have an account? <Link to="/login">Sign in</Link>
            </>
          ) : (
            <>
              New here? <Link to="/register">Create an account</Link>
            </>
          )}
        </p>
      </form>
    </main>
  );
}
