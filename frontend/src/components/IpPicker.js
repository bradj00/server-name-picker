import React, { useState, useEffect } from 'react';

function IpPicker() {
  const [subnets, setSubnets] = useState([]);
  const [selectedSubnet, setSelectedSubnet] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [useSpecificIp, setUseSpecificIp] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loadingSubnets, setLoadingSubnets] = useState(true);

  // Fetch subnets when component mounts
  useEffect(() => {
    fetchSubnets();
  }, []);

  const fetchSubnets = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Authentication token not found');
        return;
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/ipam/subnets`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch subnets');
      }

      const data = await response.json();
      setSubnets(data);
    } catch (error) {
      console.error('Error fetching subnets:', error);
      setError('Failed to load subnets. Please try refreshing the page.');
    } finally {
      setLoadingSubnets(false);
    }
  };

  const handleSubnetChange = (e) => {
    setSelectedSubnet(e.target.value);
    setResult(null);
  };

  const handleIpAddressChange = (e) => {
    setIpAddress(e.target.value);
    setResult(null);
  };

  const toggleUseSpecificIp = () => {
    setUseSpecificIp(!useSpecificIp);
    setIpAddress('');
    setResult(null);
  };

  const findIpAddress = async () => {
    if (!selectedSubnet) {
      setError('Please select a subnet');
      return;
    }

    if (useSpecificIp && !ipAddress.trim()) {
      setError('Please enter an IP address');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Authentication token not found');
        return;
      }

      let response;

      if (useSpecificIp) {
        // Check specific IP address
        response = await fetch(`${process.env.REACT_APP_API_URL}/api/ipam/check-ip`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            ip: ipAddress.trim(),
            subnetId: selectedSubnet
          })
        });
      } else {
        // Get next available IP
        response = await fetch(`${process.env.REACT_APP_API_URL}/api/ipam/next-available`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            subnetId: selectedSubnet
          })
        });
      }

      if (!response.ok) {
        throw new Error('Failed to check IP address');
      }

      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error('Error checking IP address:', error);
      setError('Failed to check IP address. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Find subnet name by ID
  const getSubnetName = (id) => {
    const subnet = subnets.find(s => s.id === id);
    return subnet ? `${subnet.description || subnet.subnet}` : id;
  };

  return (
    <div className="ip-picker">
      <div className="main-content">
        <h1>IP Address Picker</h1>
        <p>Find available IP addresses in your network.</p>

        <div className="card">
          <div className="form-group">
            <label htmlFor="subnet">Select Subnet</label>
            {loadingSubnets ? (
              <p>Loading subnets...</p>
            ) : (
              <select
                id="subnet"
                className="form-control"
                value={selectedSubnet}
                onChange={handleSubnetChange}
                disabled={loading}
              >
                <option value="">-- Select a subnet --</option>
                {subnets.map((subnet) => (
                  <option key={subnet.id} value={subnet.id}>
                    {subnet.subnet} - {subnet.description || 'No description'}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="form-group">
            <div className="form-check">
              <input
                type="checkbox"
                className="form-check-input"
                id="useSpecificIp"
                checked={useSpecificIp}
                onChange={toggleUseSpecificIp}
                disabled={loading}
              />
              <label className="form-check-label" htmlFor="useSpecificIp">
                Use a specific IP address
              </label>
            </div>
          </div>

          {useSpecificIp && (
            <div className="form-group">
              <label htmlFor="ipAddress">IP Address</label>
              <input
                type="text"
                id="ipAddress"
                className="form-control"
                value={ipAddress}
                onChange={handleIpAddressChange}
                placeholder="e.g., 192.168.1.100"
                disabled={loading}
              />
            </div>
          )}

          {error && <div className="alert alert-danger">{error}</div>}

          <button
            className="btn btn-primary"
            onClick={findIpAddress}
            disabled={loading || !selectedSubnet}
          >
            {loading ? 'Checking...' : useSpecificIp ? 'Check Availability' : 'Get Next Available IP'}
          </button>

          {result && (
            <div className="result-section mt-3">
              {useSpecificIp ? (
                <div className={`alert ${result.available ? 'alert-success' : 'alert-danger'}`}>
                  {result.available ? 
                    `IP address '${ipAddress}' is available in subnet ${getSubnetName(selectedSubnet)}` : 
                    `IP address '${ipAddress}' is already in use.`}
                </div>
              ) : (
                <div className="alert alert-success">
                  <strong>Next Available IP:</strong> {result.ip}
                  <div><small>in subnet {getSubnetName(result.subnetId)}</small></div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="card mt-4">
          <h3>Subnet Information</h3>
          {selectedSubnet ? (
            <div className="subnet-info">
              <button
                className="btn btn-secondary mb-3"
                onClick={() => {
                  window.open(`${process.env.REACT_APP_API_URL}/api/ipam/subnet/${selectedSubnet}`, '_blank');
                }}
              >
                View Complete Subnet Details
              </button>
              <p>To see all IP addresses in this subnet and detailed information, click the button above.</p>
            </div>
          ) : (
            <p>Select a subnet to view details.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default IpPicker;