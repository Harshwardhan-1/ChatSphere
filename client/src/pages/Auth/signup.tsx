import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import { env } from "../../configs/env.config";
import { showApiError } from "../../utils/showApiError";
import ThemeToggle from "../../components/ThemeToggle/ThemeToggle";
import "./Auth.css";


const MIN_LENGTH = 8;
const MIN_SCORE = 2; 
const LEVELS = ["", "Weak", "Fair", "Good", "Strong"] as const;

const RULES: { id: string; label: string; test: (p: string) => boolean }[] = [
  { id: "length", label: `At least ${MIN_LENGTH} characters`, test: (p) => p.length >= MIN_LENGTH },
  { id: "case", label: "Upper and lower case", test: (p) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { id: "number", label: "A number", test: (p) => /\d/.test(p) },
  { id: "symbol", label: "A symbol (!@#$…)", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

const getStrength = (password: string) => {
  if (!password) return { score: 0, passed: RULES.map(() => false) };
  const passed = RULES.map((r) => r.test(password));
  let score = passed.filter(Boolean).length;
  if (!passed[0]) score = Math.min(score, 1); 
  return { score: Math.max(score, 1), passed };
};



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

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);


type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  autoComplete: string;
  invalid?: boolean;
  onChange: (value: string) => void;
  children?: ReactNode;
};

const PasswordField = ({
  id,
  label,
  value,
  placeholder,
  autoComplete,
  invalid,
  onChange,
  children,
}: PasswordFieldProps) => {
  const [visible, setVisible] = useState(false);

  return (
    <div className="wp-field">
      <label className="wp-label" htmlFor={id}>
        {label}
      </label>
      <div className="wp-auth__pw">
        <input
          id={id}
          className="wp-input wp-auth__pw-input"
          type={visible ? "text" : "password"}
          placeholder={placeholder}
          autoComplete={autoComplete}
          value={value}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="wp-icon-btn wp-auth__pw-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
        >
          <EyeIcon off={visible} />
        </button>
      </div>
      {children}
    </div>
  );
};


const RegisterPage = () => {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [userName, setUserName] = useState<string>("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [formError, setFormError] = useState("");

  // Google button ko card ki width ke hisaab se fit karne ke liye
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

  const { score, passed } = getStrength(password);
  const level = LEVELS[score];
  const showMatch = confirmPassword.length > 0;
  const matches = password === confirmPassword;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError("");

    if (password.length < MIN_LENGTH) {
      setFormError(`Password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (score < MIN_SCORE) {
      setFormError("Password is too weak. Add numbers, symbols or mixed case.");
      return;
    }
    if (!matches) {
      setFormError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      const send = { name, userName, email, password };
      const response = await axios.post(
        `${env.backendUrl}/api/v1/auth/register`,
        send,
        { withCredentials: true }
      );
      if (response.data.message === "successfully register") {
        navigate("/login");
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
          <h1 className="wp-auth__title">Create your account</h1>
          <p className="wp-auth__subtitle">
            Enter your details to start chatting.
          </p>

          <form className="wp-auth__form" onSubmit={handleSubmit}>
            <div className="wp-auth__row">
              <div className="wp-field">
                <label className="wp-label" htmlFor="reg-name">
                  Your name
                </label>
                <input
                  id="reg-name"
                  className="wp-input"
                  type="text"
                  placeholder="Enter your name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="wp-field">
                <label className="wp-label" htmlFor="reg-username">
                  Username
                </label>
                <input
                  id="reg-username"
                  className="wp-input"
                  type="text"
                  placeholder="Choose a username"
                  autoComplete="username"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                />
              </div>
            </div>

            <div className="wp-field">
              <label className="wp-label" htmlFor="reg-email">
                Email
              </label>
              <input
                id="reg-email"
                className="wp-input"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <PasswordField
              id="reg-password"
              label="Password"
              placeholder="Create a password"
              autoComplete="new-password"
              value={password}
              onChange={setPassword}
            >
              <div
                className="wp-strength"
                data-open={password.length > 0}
                data-level={score}
              >
                <div className="wp-strength__inner">
                  <div className="wp-strength__top">
                    <div className="wp-strength__bars" aria-hidden="true">
                      {[1, 2, 3, 4].map((n) => (
                        <span
                          key={n}
                          className={`wp-strength__bar${n <= score ? " is-on" : ""}`}
                        />
                      ))}
                    </div>
                    <span className="wp-strength__label" aria-live="polite">
                      {level}
                    </span>
                  </div>

                  <ul className="wp-strength__rules">
                    {RULES.map((r, i) => (
                      <li
                        key={r.id}
                        className={`wp-strength__rule${passed[i] ? " is-met" : ""}`}
                      >
                        <span className="wp-strength__tick">
                          <CheckIcon />
                        </span>
                        {r.label}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </PasswordField>

            <PasswordField
              id="reg-confirm"
              label="Confirm password"
              placeholder="Re-enter your password"
              autoComplete="new-password"
              value={confirmPassword}
              invalid={showMatch && !matches}
              onChange={setConfirmPassword}
            >
              {showMatch && (
                <p
                  className={`wp-match ${matches ? "wp-match--ok" : "wp-match--bad"}`}
                  role="status"
                >
                  {matches ? "Passwords match" : "Passwords do not match"}
                </p>
              )}
            </PasswordField>

            {formError && (
              <div className="wp-auth__alert" role="alert">
                {formError}
              </div>
            )}

            <button
              className="wp-btn wp-btn--primary wp-btn--block"
              type="submit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="wp-auth__spinner" aria-hidden="true" />
                  Creating account…
                </>
              ) : (
                "Register"
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
            Already have an account?{" "}
            <Link to="/login" className="wp-auth__link">
              Login
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
};

export default RegisterPage;