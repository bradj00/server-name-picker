# Server Name Picker

A microservice-driven application to help you find unique hostnames and IP addresses by querying ProxMox and phpIPAM APIs.

## Project Overview

Server Name Picker is a web-based tool that connects to your ProxMox hypervisor and phpIPAM instance to help you select unique hostnames and available IP addresses for new servers. This tool is designed to streamline the server provisioning process by providing a unified interface for hostname and IP selection.

### Features

- LDAP authentication for secure access
- Hostname availability checking through ProxMox API
- IP address management through phpIPAM API
- Hostname suggestions based on naming conventions
- Next available IP lookup in selected subnets
- Kafka integration for asynchronous processing

## Architecture

Server Name Picker follows a microservice architecture with the following components:

- **Frontend**: React-based web interface
- **API Gateway**: Central entry point for all client requests
- **Auth Service**: LDAP authentication and JWT token management
- **ProxMox Service**: Interacts with ProxMox API to check hostname availability
- **IPAM Service**: Interacts with phpIPAM API to manage IP addresses
- **Kafka Consumer**: Processes messages from Kafka topics

## Prerequisites

- Node.js v18 or higher
- Kafka (already set up as shown in the requirements)
- Access to ProxMox API
- Access to phpIPAM API
- LDAP server for authentication

## Getting Started

### Configuration

1. Copy the `.env.example` files in each service directory to `.env` files:

```bash
cd server-name-picker
find . -name ".env.example" -exec sh -c 'cp "$1" "${1%.example}"' _ {} \;
```

2. Edit each `.env` file with your specific configuration details:
   - Set LDAP connection parameters in the auth service
   - Configure ProxMox API access in the proxmox service
   - Set phpIPAM API credentials in the ipam service
   - Update Kafka broker details in all services

### Installing Dependencies

Install dependencies for each service:

```bash
cd server-name-picker
cd frontend && npm install
cd ../api-gateway && npm install
cd ../services/proxmox-service && npm install
cd ../ipam-service && npm install
cd ../../auth-service && npm install
cd ../kafka-consumer && npm install
```

### Running the Services

Start each service in a separate terminal:

1. Start the Auth Service:

```bash
cd server-name-picker/auth-service
npm run dev
```

2. Start the ProxMox Service:

```bash
cd server-name-picker/services/proxmox-service
npm run dev
```

3. Start the IPAM Service:

```bash
cd server-name-picker/services/ipam-service
npm run dev
```

4. Start the API Gateway:

```bash
cd server-name-picker/api-gateway
npm run dev
```

5. Start the Kafka Consumer:

```bash
cd server-name-picker/kafka-consumer
npm run dev
```

6. Start the Frontend:

```bash
cd server-name-picker/frontend
npm start
```

The frontend will be available at http://localhost:3000.

## API Documentation

### API Gateway Endpoints

- `POST /api/auth/login` - Authenticate user
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/user` - Get current user info

- `GET /api/proxmox/nodes` - List ProxMox nodes
- `GET /api/proxmox/vms` - List all VMs
- `GET /api/proxmox/hosts` - List all hostnames
- `POST /api/proxmox/check-hostname` - Check hostname availability

- `GET /api/ipam/subnets` - List all subnets
- `GET /api/ipam/subnet/:id` - Get subnet details
- `GET /api/ipam/addresses` - List all IP addresses
- `POST /api/ipam/check-ip` - Check IP availability
- `POST /api/ipam/next-available` - Get next available IP in subnet

## Kafka Topics

- `hostname-requests` - Hostname availability check requests
- `hostname-responses` - Hostname availability check results
- `ip-requests` - IP address check requests
- `ip-responses` - IP address check results
- `user-activity` - User activity events

## Future Enhancements

- Dockerization of services
- Integration with DNS services for hostname registration
- Integration with configuration management tools
- Batch operations for multiple hostnames/IPs
- Enhanced access control and user management
