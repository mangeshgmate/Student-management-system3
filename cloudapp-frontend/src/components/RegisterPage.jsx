import { useState } from 'react';
import './AuthForm.css';

const GMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
const NAME_REGEX = /^[a-zA-Z\s]+$/;

const RegisterPage = ({ registeredStudents = [], onRegisterSuccess, onNavigateToLogin }) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState({});

  const validatePasswordStrength = (pass) => {
    const rules = [];
    if (pass.length < 8) rules.push('At least 8 characters long');
    if (!/[A-Z]/.test(pass)) rules.push('At least 1 uppercase letter (A-Z)');
    if (!/[a-z]/.test(pass)) rules.push('At least 1 lowercase letter (a-z)');
    if (!/[0-9]/.test(pass)) rules.push('At least 1 number (0-9)');
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pass)) {
      rules.push('At least 1 special character (!@#$%^&*)');
    }
    return rules;
  };

  const getLatestStudents = () => {
    const local = JSON.parse(localStorage.getItem('registeredStudents') || '[]');
    return registeredStudents.length > 0 ? registeredStudents : local;
  };

  const validateForm = () => {
    const errs = {};
    const trimmedFullName = fullName.trim();
    const trimmedEmail = email.trim().toLowerCase();

    // Full Name Validation
    if (!trimmedFullName) {
      errs.fullName = 'Full Name is required.';
    } else if (!NAME_REGEX.test(trimmedFullName)) {
      errs.fullName = 'Please enter letters only (no numbers or special symbols).';
    }

    // Email Validation
    if (!trimmedEmail) {
      errs.email = 'Email address is required.';
    } else if (!GMAIL_REGEX.test(trimmedEmail)) {
      errs.email = 'Email must end with @gmail.com (e.g., student@gmail.com).';
    } else {
      const currentStudents = getLatestStudents();
      const exists = currentStudents.some(
        (student) => student.email.trim().toLowerCase() === trimmedEmail
      );
      if (exists) errs.email = 'This email address is already registered.';
    }

    // Password Validation
    const passwordRules = validatePasswordStrength(password);
    if (passwordRules.length > 0) {
      errs.password = passwordRules;
    }

    // Confirm Password Validation
    if (!confirmPassword) {
      errs.confirmPassword = 'Please confirm your password.';
    } else if (password !== confirmPassword) {
      errs.confirmPassword = 'Passwords do not match.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    const normalizedEmail = email.trim().toLowerCase();

    const newStudent = {
      fullName: fullName.trim(),
      email: normalizedEmail,
      password,
      role: 'student'
    };

    // Save to LocalStorage immediately so it is available even if state updates late
    const currentStudents = getLatestStudents();
    const updatedList = [...currentStudents, newStudent];
    localStorage.setItem('registeredStudents', JSON.stringify(updatedList));

    onRegisterSuccess(newStudent);
  };

  return (
    <div className="auth-card-container">
      <div className="auth-card">
        <h2>Student Registration</h2>
        <p className="auth-subtitle">Create an account to register for portal access.</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="reg-fullname">Full Name</label>
            <input
              id="reg-fullname"
              type="text"
              className={errors.fullName ? 'input-error' : ''}
              placeholder="John Doe"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            {errors.fullName && <span className="field-error">{errors.fullName}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="reg-email">Gmail Address</label>
            <input
              id="reg-email"
              type="email"
              className={errors.email ? 'input-error' : ''}
              placeholder="student@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {errors.email && <span className="field-error">{errors.email}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="reg-password">Password</label>
            <input
              id="reg-password"
              type="password"
              className={errors.password ? 'input-error' : ''}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {Array.isArray(errors.password) && (
              <ul className="field-error-list">
                {errors.password.map((rule, idx) => (
                  <li key={idx}>{rule}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="reg-confirm-password">Confirm Password</label>
            <input
              id="reg-confirm-password"
              type="password"
              className={errors.confirmPassword ? 'input-error' : ''}
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {errors.confirmPassword && (
              <span className="field-error">{errors.confirmPassword}</span>
            )}
          </div>

          <button type="submit" className="auth-btn">Register</button>
        </form>

        <p className="auth-footer">
          Already have an account?{' '}
          <button type="button" className="link-btn" onClick={onNavigateToLogin}>
            Sign In
          </button>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;