import React, { useState, useEffect } from 'react';

function HostnamePicker() {
  const [hostname, setHostname] = useState('');
  const [prefix, setPrefix] = useState('');
  const [result, setResult] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [existingHosts, setExistingHosts] = useState([]);
  const [loadingHosts, setLoadingHosts] = useState(true);

  // Fetch existing hosts when component mounts
  useEffect(() => {
    fetchExistingHosts();
  }, []);

  const fetchExistingHosts = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Authentication token not found');
        return;
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/proxmox/hosts`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch hosts');
      }

      const data = await response.json();
      setExistingHosts(data);
    } catch (error) {
      console.error('Error fetching hosts:', error);
      setError('Failed to load existing hosts. Please try refreshing the page.');
    } finally {
      setLoadingHosts(false);
    }
  };

  const checkHostname = async () => {
    if (!hostname.trim()) {
      setError('Please enter a hostname');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    setSuggestions([]);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Authentication token not found');
        return;
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/proxmox/check-hostname`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          hostname: hostname.trim(),
          prefix: prefix.trim()
        })
      });

      if (!response.ok) {
        throw new Error('Failed to check hostname');
      }

      const data = await response.json();
      setResult(data);
      if (data.suggestions) {
        setSuggestions(data.suggestions);
      }
    } catch (error) {
      console.error('Error checking hostname:', error);
      setError('Failed to check hostname availability. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const selectSuggestion = (suggestion) => {
    setHostname(suggestion);
    // Check the selected suggestion immediately
    setResult(null);
    setSuggestions([]);
  };

  return (
    <div className="hostname-picker">
      <div className="main-content">
        <h1>Hostname Picker</h1>
        <p>Check if a hostname is available or get suggestions for available names.</p>

        <div className="card">
          <div className="form-group">
            <label htmlFor="hostname">Hostname</label>
            <input
              type="text"
              id="hostname"
              className="form-control"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder="Enter desired hostname"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="prefix">Prefix (optional)</label>
            <input
              type="text"
              id="prefix"
              className="form-control"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="e.g., 'web' for web servers"
              disabled={loading}
            />
            <small className="form-text text-muted">
              Providing a prefix will generate suggestions if your hostname is unavailable
            </small>
          </div>

          {error && <div className="alert alert-danger">{error}</div>}

          <button
            className="btn btn-primary"
            onClick={checkHostname}
            disabled={loading}
          >
            {loading ? 'Checking...' : 'Check Availability'}
          </button>

          {result && (
            <div className={`alert ${result.available ? 'alert-success' : 'alert-danger'} mt-3`}>
              {result.available ? 
                `Hostname '${hostname}' is available!` : 
                `Hostname '${hostname}' is already in use.`}
            </div>
          )}

          {suggestions && suggestions.length > 0 && (
            <div className="suggestions mt-3">
              <h3>Available Suggestions</h3>
              <ul className="suggestion-list">
                {suggestions.map((suggestion, index) => (
                  <li key={index}>
                    <button
                      className="btn btn-outline-primary"
                      onClick={() => selectSuggestion(suggestion)}
                    >
                      {suggestion}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="card mt-4">
          <h3>Existing Hostnames</h3>
          {loadingHosts ? (
            <p>Loading hosts...</p>
          ) : existingHosts.length > 0 ? (
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Hostname</th>
                    <th>Node</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {existingHosts.map((host, index) => (
                    <tr key={index}>
                      <td>{host.id}</td>
                      <td>{host.name}</td>
                      <td>{host.node}</td>
                      <td>
                        <span className={`status-badge status-${host.status}`}>
                          {host.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No hosts found.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default HostnamePicker;