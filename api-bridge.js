import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';

const app = express();
app.use(cors());
app.use(express.json());

// Function to call our MCP server
async function callMCPServer(method, params) {
  return new Promise((resolve, reject) => {
    const server = spawn('node', ['dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd()
    });
    
    const request = {
      jsonrpc: "2.0",
      id: 1,
      method,
      params
    };
    
    let output = '';
    let errorOutput = '';
    
    server.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    server.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    server.on('close', (code) => {
      if (code === 0) {
        try {
          const lines = output.split('\n').filter(line => line.trim());
          const lastLine = lines[lines.length - 1];
          const result = JSON.parse(lastLine);
          resolve(result);
        } catch (e) {
          reject(new Error('Failed to parse MCP response'));
        }
      } else {
        reject(new Error(`MCP server failed: ${errorOutput}`));
      }
    });
    
    server.stdin.write(JSON.stringify(request) + '\n');
    server.stdin.end();
  });
}

// API endpoint for Pokémon data
app.get('/api/pokemon/:name', async (req, res) => {
  try {
    const result = await callMCPServer('resources/read', {
      uri: `resource://pokemon/data?name=${req.params.name}`
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API endpoint for battle simulation
app.post('/api/battle', async (req, res) => {
  try {
    const { pokemonA, pokemonB } = req.body;
    const result = await callMCPServer('tools/call', {
      name: 'simulate_battle',
      arguments: { pokemonA, pokemonB }
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = 3002;
app.listen(PORT, () => {
  console.log(`API Bridge running on http://localhost:${PORT}`);
});
