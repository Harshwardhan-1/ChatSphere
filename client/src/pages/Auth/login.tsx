import { useEffect, useRef, useState, type FormEvent } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import { env } from "../../configs/env.config";
import { showApiError } from "../../utils/showApiError";
import ThemeToggle from "../../components/ThemeToggle/ThemeToggle";
import "./Auth.css";

const EyeIcon = ({ off }: { off: boolean }) =>
  off ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17.94 17.94A10.9 10.9 0 0 1 12 19c-6.5 0-10-7-10-7a18.7 18.7 0 0 1 4.06-5.06M9.9 4.24A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a18.6 18.6 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <path d="m2 2 20 20" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState<boolean>(false);

  const googleRef = useRef<HTMLDivElement>(null);
  const [googleWidth, setGoogleWidth] = useState(300);

  useEffect(() => {
    const el = googleRef.current;
    if (!el) return;
    const update = () =>
      setGoogleWidth(Math.min(400, Math.max(200, Math.floor(el.clientWidth))));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const send = { email, password };
      const response = await axios.post(
        `${env.backendUrl}/api/v1/auth/login`,
        send,
        { withCredentials: true }
      );
      if (response.data.message === "successfully verified") {
        localStorage.setItem("token", response.data.token);
        navigate("/chat");
      }
    } catch (err) {
      showApiError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="wp-auth">
      <header className="wp-auth__header wp-container">
        <Link to="/" className="wp-auth__brand">
          <img src="/WhatsApp.svg" alt="" className="wp-auth__brand-logo" />
          <span>WhatsApp</span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="wp-auth__main wp-container">
        <div className="wp-auth__card">
          <h1 className="wp-auth__title">Welcome back</h1>
          <p className="wp-auth__subtitle">Sign in to continue chatting.</p>

          <form className="wp-auth__form" onSubmit={handleSubmit}>
            <div className="wp-field">
              <label className="wp-label" htmlFor="login-email">
                Email
              </label>
              <input
                id="login-email"
                className="wp-input"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="wp-field">
              <label className="wp-label" htmlFor="login-password">
                Password
              </label>
              <div className="wp-auth__pw">
                <input
                  id="login-password"
                  className="wp-input wp-auth__pw-input"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="wp-icon-btn wp-auth__pw-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  <EyeIcon off={showPassword} />
                </button>
              </div>
            </div>

            <button
              className="wp-btn wp-btn--primary wp-btn--block"
              type="submit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="wp-auth__spinner" aria-hidden="true" />
                  Signing in…
                </>
              ) : (
                "Login"
              )}
            </button>
          </form>

          <div className="wp-auth__divider">
            <span>or</span>
          </div>

          <div className="wp-auth__google" ref={googleRef}>
            <GoogleLogin
              onSuccess={async (res) => {
                try {
                  const response = await axios.post(
                    `${env.backendUrl}/api/v1/auth/google`,
                    { credential: res.credential },
                    { withCredentials: true }
                  );
                  if (response.data.success) {
                    localStorage.setItem("token", response.data.token);
                    navigate("/chat");
                  }
                } catch (err) {
                  showApiError(err);
                }
              }}
              onError={() => console.log("Google login fail")}
              theme="outline"
              size="large"
              shape="pill"
              text="signin_with"
              logo_alignment="left"
              width={String(googleWidth)}
            />
          </div>

          <p className="wp-auth__switch">
            Don't have an account?{" "}
            <Link to="/Signup" className="wp-auth__link">
              Sign Up
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
};

export default Login;