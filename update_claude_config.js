const fs = require('fs');
const path = require('path');
const configPath = "/Users/shhiivvaam/Library/Application Support/Claude/claude_desktop_config.json";
const serverKey = "pokemon-mcp";
const entry = {
  command: "node",
  args: ["dist/index.js"],
  cwd: "/Users/shhiivvaam/Documents/learn/Battle Game"
};
let data = {};
if (fs.existsSync(configPath)) {
  try { data = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch { data = {}; }
  const backupPath = configPath + ".bak-" + Date.now();
  try { fs.copyFileSync(configPath, backupPath); } catch {}
}
if (!data || typeof data !== 'object') data = {};
if (!data.mcpServers || typeof data.mcpServers !== 'object') data.mcpServers = {};
// set/overwrite our server entry only
data.mcpServers[serverKey] = entry;
fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
console.log("Updated:", configPath);
