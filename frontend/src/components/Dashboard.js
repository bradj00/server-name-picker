import React from 'react';
import { Link } from 'react-router-dom';

function Dashboard() {
  return (
    <div className="dashboard">
      <div className="main-content">
        <h1>Welcome to Server Name Picker</h1>
        <p className="intro">
          This tool helps you find available hostnames and IP addresses by querying ProxMox and phpIPAM.
        </p>
        
        <div className="dashboard-cards">
          <div className="card">
            <h2>Hostname Picker</h2>
            <p>
              Look for available hostnames in your ProxMox environment.
              Check if a desired hostname is available or get suggestions for available names.
            </p>
            <Link to="/hostname-picker" className="btn btn-primary">
              Pick a Hostname
            </Link>
          </div>
          
          <div className="card">
            <h2>IP Address Picker</h2>
            <p>
              Find available IP addresses in your network.
              Select a subnet and get the next available IP address or check if a specific IP is available.
            </p>
            <Link to="/ip-picker" className="btn btn-primary">
              Pick an IP Address
            </Link>
          </div>
        </div>
        
        <div className="card">
          <h2>How It Works</h2>
          <p>
            Server Name Picker connects to your ProxMox and phpIPAM instances through their APIs to
            provide real-time information about available resources. It uses LDAP for authentication
            to ensure secure access.
          </p>
          <ul>
            <li>Securely authenticate using your LDAP credentials</li>
            <li>Connect to ProxMox API to verify hostname availability</li>
            <li>Query phpIPAM to find available IP addresses in your network</li>
            <li>Get suggestions based on naming conventions and available resources</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;