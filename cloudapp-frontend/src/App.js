import { useEffect, useState } from 'react';
import './App.css';
import AdminDashboard from './components/AdminDashboard/AdminDashboard';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import StudentDashboard from './components/StudentDashboard/StudentDashboard';

function App() {
  const [currentView, setCurrentView] = useState('login'); // 'login' | 'register' | 'student' | 'admin'
  const [currentUser, setCurrentUser] = useState(null);

  // Auto-fill state for LoginPage after registration
  const [prefilledCredentials, setPrefilledCredentials] = useState({
    email: '',
    password: ''
  });

  // Load stored users from localStorage on initial render
  const [users, setUsers] = useState(() => {
    const saved = localStorage.getItem('app_registered_users');
    return saved ? JSON.parse(saved) : [];
  });

  // Sync users to localStorage whenever state updates
  useEffect(() => {
    localStorage.setItem('app_registered_users', JSON.stringify(users));
  }, [users]);

  // Handle successful registration
  const handleRegisterSuccess = (newUser) => {
    setUsers((prev) => [...prev, newUser]);
    setPrefilledCredentials({
      email: newUser.email,
      password: newUser.password
    });
    setCurrentView('login');
  };

  // Handle successful login
  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    if (user.role === 'admin') {
      setCurrentView('admin');
    } else {
      setCurrentView('student');
    }
  };

  // Handle logout
  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentView('login');
  };

  return (
    <div className="app-container">
      {currentView === 'login' && (
        <LoginPage
          registeredUsers={users}
          initialEmail={prefilledCredentials.email}
          initialPassword={prefilledCredentials.password}
          onLoginSuccess={handleLoginSuccess}
          onNavigateToRegister={() => setCurrentView('register')}
        />
      )}

      {currentView === 'register' && (
        <RegisterPage
          registeredUsers={users}
          onRegisterSuccess={handleRegisterSuccess}
          onNavigateToLogin={() => setCurrentView('login')}
        />
      )}

      {currentView === 'student' && currentUser && (
        <StudentDashboard currentUser={currentUser} onLogout={handleLogout} />
      )}

      {currentView === 'admin' && currentUser && (
        <AdminDashboard currentUser={currentUser} onLogout={handleLogout} />
      )}
    </div>
  );
}

export default App;