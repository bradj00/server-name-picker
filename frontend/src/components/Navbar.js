import React from 'react';
import { Link, useNavigate } from 'react-router-dom';

function Navbar({ isAuthenticated, user, onLogout }) {
  const navigate = useNavigate();
  
  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('token');
      
      if (token) {
        // Call logout API
        await fetch(`${process.env.REACT_APP_API_URL}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Call the onLogout callback regardless of API response
      onLogout();
      navigate('/login');
    }
  };

  return (
    <header className="header">
      <div className="container header-content">
        <div className="logo">
          <Link to="/">Server Name Picker</Link>
        </div>
        
        <nav className="main-nav">
          {isAuthenticated ? (
            <>
              <ul>
                <li>
                  <Link to="/">Dashboard</Link>
                </li>
                <li>
                  <Link to="/hostname-picker">Hostname Picker</Link>
                </li>
                <li>
                  <Link to="/ip-picker">IP Picker</Link>
                </li>
              </ul>
            </>
          ) : null}
        </nav>
        
        <div className="user-nav">
          {isAuthenticated ? (
            <div className="user-info">
              <span className="user-name">
                {user?.name || user?.uid || 'User'}
              </span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleLogout}
              >
                Logout
              </button>
            </div>
          ) : (
            <Link to="/login" className="btn btn-primary btn-sm">
              Login
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

export default Navbar;