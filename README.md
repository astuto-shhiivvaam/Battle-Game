## Pokémon MCP Server

An MCP server exposing:
- Pokémon Data resource (via PokeAPI)
- Battle Simulation tool (type matchups, damage, status effects)

### Requirements
- Node.js 18+

### Install
```bash
npm install
```

### Dev run (stdio)
This server uses stdio transport. For quick local tests you can run:
```bash
npm run dev
```
It will wait for MCP client frames over stdio.

### Build
```bash
npm run build && npm start
```

### Resources
- `resource://pokemon/data`
  - Optional params: `{ "name": string }` or `{ "id": number }`
  - Example request (MCP JSON-RPC, conceptual):
```json
{
  "method": "resources/read",
  "params": {
    "uri": "resource://pokemon/data",
    "arguments": { "name": "pikachu" }
  },
  "id": 1
}
```
  - Example response excerpt:
```json
{
  "id": 1,
  "result": {
    "id": 25,
    "name": "pikachu",
    "types": ["electric"],
    "base_stats": { "hp": 35, "attack": 55, "defense": 40, "special_attack": 50, "special_defense": 50, "speed": 90 },
    "abilities": ["static", "lightning-rod"],
    "moves": [ { "name": "thunderbolt" }, ...],
    "evolution_chain": ["pichu", "pikachu", "raichu"]
  }
}
```

If no arguments are passed, the resource returns an index of Pokémon names and a hint.

### Tools
- `simulate_battle`
  - Params: `{ "pokemonA": string, "pokemonB": string }`
  - Simulates a level-50 style, single-Pokémon battle using:
    - Type effectiveness
    - Damage formula (simplified)
    - Speed-based turn order with paralysis speed penalty
    - Status effects: paralysis (25% skip, speed halved), burn (6.25%/turn), poison (12.5%/turn)
  - Returns: participants, detailed log, and winner name or `"draw"`.

Example request (MCP JSON-RPC, conceptual):
```json
{
  "method": "tools/call",
  "params": {
    "name": "simulate_battle",
    "arguments": { "pokemonA": "charizard", "pokemonB": "blastoise" }
  },
  "id": 2
}
```

### Notes
- Uses PokeAPI live data with a 60s in-memory cache.
- Move selection prefers super effective highest-power moves among the first 30 learned moves.
- This is intended for LLM integration demonstrations, not a full competitive simulator.
