# Testing n8n-nodes-memory Locally with Docker

This directory contains a distribution build of the n8n-nodes-memory package ready for testing with a local n8n instance.

## Quick Start with Docker Compose

### Prerequisites

- Docker and Docker Compose installed
- **MemMachine running externally** (on host or separate Docker network)

### Start n8n with the Memory Node

```bash
# Start n8n and Jaeger
docker-compose up -d

# View logs
docker-compose logs -f

# Access services:
# - n8n UI: http://localhost:5678
# - Jaeger UI: http://localhost:16686
# Default n8n credentials on first run: create your own

# Stop services
docker-compose down
```

The stack includes:

- **n8n** (localhost:5678) - Workflow automation with Memory node
- **Jaeger** (localhost:16686) - Distributed tracing UI for observability

### Configure MemMachine Connection

The MemMachine service must be running separately. Configure credentials in n8n:

**If MemMachine is on your host:**

- API Endpoint: `http://host.docker.internal:8080` (Mac/Windows)
- API Endpoint: `http://172.17.0.1:8080` (Linux - Docker bridge IP)

**If MemMachine is in another Docker network:**

- Add n8n to that network in docker-compose.yml
- API Endpoint: `http://memmachine:8080` (use service name)

**If MemMachine is on remote server:**

- API Endpoint: `http://your-memmachine-host:8080`
- API Key: (if authentication is enabled)

### Alternative: Install as npm Package

Instead of using Docker, you can install directly into a local n8n instance:

```bash
# Link to local n8n
npm link
cd ~/.n8n/custom
npm link n8n-nodes-memory

# Or install globally
npm install -g .

# Restart n8n
```

## Configuration

### MemMachine API Credentials

1. Open n8n at http://localhost:5678
2. Go to **Credentials** → **New**
3. Search for "MemMachine API"
4. Configure:
   - **API Endpoint**: `http://memmachine:8080` (Docker) or `http://localhost:8080` (local)
   - **API Key**: (optional, if your MemMachine requires authentication)
5. Test and save

### Using the Memory Node

1. Create a new workflow
2. Add the **Memory** node
3. Select operation:
   - **Store**: Save conversation messages
   - **Enrich**: Retrieve historical context
4. Configure session context:
   - Group ID, Agent ID, User ID, Session ID

## Files in This Directory

- `package.json` - Cleaned package metadata (no devDependencies)
- `nodes/` - Memory node implementation
- `credentials/` - MemMachine API credentials definition
- `dist/` - Compiled JavaScript
- `LICENSE` - MIT license
- `README.md` - This file
- `docker-compose.yml` - Docker setup for local testing

## Advanced Docker Configuration

### Connecting to MemMachine on Same Docker Network

If your MemMachine is in another Docker Compose stack, connect them:

```yaml
# In this docker-compose.yml, add external network
networks:
  n8n-network:
    name: n8n-memory-network
    driver: bridge
  memmachine-network:
    external: true
    name: your-memmachine-network

services:
  n8n:
    networks:
      - n8n-network
      - memmachine-network
```

Then use the MemMachine service name as endpoint: `http://memmachine:8080`

### Using Host Network (Linux only)

```yaml
services:
  n8n:
    network_mode: host
```

Then use `http://localhost:8080` as the MemMachine endpoint.

## Troubleshooting

### Node not appearing in n8n

1. Check logs: `docker-compose logs n8n`
2. Verify volume mount: `docker exec -it n8n-memory-test ls /data/nodes`
3. Restart: `docker-compose restart n8n`

### Cannot connect to MemMachine

1. Check MemMachine is running: `curl http://localhost:8080/health`
2. Check network connectivity: `docker exec -it n8n-memory-test ping memmachine`
3. Verify credentials configuration in n8n UI

### Jaeger not showing traces

1. Check Jaeger is running: `docker-compose logs jaeger`
2. Access Jaeger UI: <http://localhost:16686>
3. Verify environment variables in docker-compose.yml:
   - `JAEGER_AGENT_HOST=jaeger`
   - `JAEGER_AGENT_PORT=6831`
4. Check traces are being sent: Look for "Service" dropdown in Jaeger UI
5. If no traces appear, check Memory node logs for OpenTelemetry errors

### Permission issues

```bash
# Fix permissions
chmod -R 755 .
docker-compose down -v
docker-compose up -d
```

## Observability with Jaeger

The Memory node includes OpenTelemetry instrumentation for distributed tracing. Use Jaeger to:

- **Monitor performance**: See execution time for store and enrich operations
- **Debug issues**: Trace requests through n8n → Memory node → MemMachine
- **Analyze patterns**: Identify slow queries or error patterns

**Viewing Traces:**

1. Open Jaeger UI at <http://localhost:16686>
2. Select service from dropdown (look for Memory node service name)
3. Click "Find Traces" to see recent operations
4. Click on a trace to see detailed span information

## Publishing to npm

When ready to publish:

```bash
# Test the package
npm pack
npm install -g ./n8n-nodes-memory-*.tgz

# Publish to npm
npm publish

# Or publish to private registry
npm publish --registry https://your-registry.com
```

## Resources

- [n8n Documentation](https://docs.n8n.io/)
- [MemMachine Documentation](https://docs.memmachine.ai/)
- [Creating n8n Nodes](https://docs.n8n.io/integrations/creating-nodes/)

## Support

For issues or questions:
- GitHub Issues: [Your repository URL]
- MemMachine Docs: https://docs.memmachine.ai/
