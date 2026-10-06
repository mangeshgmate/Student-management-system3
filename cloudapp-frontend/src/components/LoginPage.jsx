import { useEffect, useState } from 'react';
import './AuthForm.css';

const GMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;

const LoginPage = ({
  registeredStudents = [],
  initialEmail = '',
  initialPassword = '',
  onLoginSuccess,
  onNavigateToRegister
}) => {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState(initialPassword);
  const [errors, setErrors] = useState({});
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    if (initialEmail) setEmail(initialEmail);
    if (initialPassword) setPassword(initialPassword);
  }, [initialEmail, initialPassword]);

  const validateForm = () => {
    const errs = {};
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      errs.email = 'Email address or username is required.';
    } else if (trimmedEmail !== 'admin@1234' && !GMAIL_REGEX.test(trimmedEmail)) {
      errs.email = 'Please enter a valid Gmail address (e.g., student@gmail.com).';
    }

    if (!password) {
      errs.password = 'Password is required.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setAuthError('');

    if (!validateForm()) return;

    const trimmedEmail = email.trim().toLowerCase();

    // 1. Check for Admin Login
    if (trimmedEmail === 'admin@1234' && password === 'admin123') {
      onLoginSuccess({
        fullName: 'System Administrator',
        email: 'admin@1234',
        role: 'admin'
      });
      return;
    }

    // 2. Fetch students from props OR directly from localStorage fallback
    const localStudents = JSON.parse(localStorage.getItem('registeredStudents') || '[]');
    const studentList = registeredStudents.length > 0 ? registeredStudents : localStudents;

    // 3. Match user ignoring case and accidental spaces
    const matchedStudent = studentList.find(
      (student) => student.email.trim().toLowerCase() === trimmedEmail
    );

    if (!matchedStudent) {
      setAuthError('User not registered. Please sign up first.');
      return;
    }

    if (matchedStudent.password !== password) {
      setAuthError('Invalid password. Please try again.');
      return;
    }

    onLoginSuccess(matchedStudent);
  };

  return (
    <div className="auth-card-container">
      <div className="auth-card">
        <h2>Student Portal Login</h2>
        <p className="auth-subtitle">Sign in with your registered account details.</p>

        {authError && <div className="error-banner">{authError}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="login-email">Email / Username</label>
            <input
              id="login-email"
              type="text"
              className={errors.email ? 'input-error' : ''}
              placeholder="student@gmail.com or admin@1234"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {errors.email && <span className="field-error">{errors.email}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              className={errors.password ? 'input-error' : ''}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {errors.password && <span className="field-error">{errors.password}</span>}
          </div>

          <button type="submit" className="auth-btn">Log In</button>
        </form>

        <p className="auth-footer">
          Don't have an account?{' '}
          <button type="button" className="link-btn" onClick={onNavigateToRegister}>
            Register here
          </button>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;