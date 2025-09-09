import React, { useState } from 'react';

interface Pokemon {
  id: number;
  name: string;
  types: string[];
  base_stats: Record<string, number>;
  abilities: string[];
  moves: { name: string }[];
  height: number;
  weight: number;
  evolution_chain: string[];
}

interface BattleResult {
  participants: { name: string; types: string[] }[];
  log: string[];
  result: string;
}

function App() {
  const [activeTab, setActiveTab] = useState('lookup');
  const [pokemonName, setPokemonName] = useState('');
  const [pokemonData, setPokemonData] = useState<Pokemon | null>(null);
  const [battlePokemonA, setBattlePokemonA] = useState('');
  const [battlePokemonB, setBattlePokemonB] = useState('');
  const [battleResult, setBattleResult] = useState<BattleResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const lookupPokemon = async () => {
    if (!pokemonName.trim()) { return };

    setLoading(true);
    setError('');

    try {
      // Since we can't directly call MCP from browser, we'll use the demo functionality
      // In a real setup, you'd proxy through a backend or use MCP client-side
      const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${pokemonName.toLowerCase()}`);
      if (!response.ok) {
        throw new Error('Pokémon not found');
      }

      const pokemon = await response.json();
      const speciesResponse = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${pokemonName.toLowerCase()}`);
      const species = await speciesResponse.json();
      const evoResponse = await fetch(species.evolution_chain.url);
      const evo = await evoResponse.json();

      const chain: string[] = [];
      const traverse = (node: any) => {
        chain.push(node.species.name);
        for (const next of node.evolves_to ?? []) traverse(next);
      };
      traverse(evo.chain);

      const data: Pokemon = {
        id: pokemon.id,
        name: pokemon.name,
        types: pokemon.types.map((t: any) => t.type.name),
        base_stats: pokemon.stats.reduce((acc: any, s: any) => {
          const key = s.stat.name.replace("-", "_");
          acc[key] = s.base_stat;
          return acc;
        }, {}),
        abilities: pokemon.abilities.map((a: any) => a.ability.name),
        moves: pokemon.moves.slice(0, 10).map((m: any) => ({ name: m.move.name })),
        height: pokemon.height,
        weight: pokemon.weight,
        evolution_chain: chain,
      };

      setPokemonData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch Pokémon data');
    } finally {
      setLoading(false);
    }
  };

  const simulateBattle = async () => {
    if (!battlePokemonA.trim() || !battlePokemonB.trim()) { return };

    setLoading(true);
    setError('');

    try {
      // Simulate calling our MCP server's battle simulation
      // In reality, this would call our backend battle simulation
      const response = await fetch('/api/battle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pokemonA: battlePokemonA, pokemonB: battlePokemonB })
      });

      if (!response.ok) {
        // Fallback to demo simulation
        const demoResult: BattleResult = {
          participants: [
            { name: battlePokemonA.toLowerCase(), types: ['unknown'] },
            { name: battlePokemonB.toLowerCase(), types: ['unknown'] }
          ],
          log: [
            '-- Turn 1 --',
            `${battlePokemonA} used tackle and dealt 42 damage.`,
            `${battlePokemonB} used quick-attack and dealt 38 damage.`,
            `${battlePokemonA}: 82/120 HP | ${battlePokemonB}: 95/110 HP`,
            '-- Turn 2 --',
            `${battlePokemonA} used body-slam and dealt 55 damage.`,
            `${battlePokemonB} used thunderbolt and dealt 67 damage. It's super effective!`,
            `${battlePokemonA}: 15/120 HP | ${battlePokemonB}: 40/110 HP`,
            '-- Turn 3 --',
            `${battlePokemonA} used hyper-beam and dealt 89 damage.`,
            `${battlePokemonA}: 15/120 HP | ${battlePokemonB}: 0/110 HP`
          ],
          result: battlePokemonA.toLowerCase()
        };
        setBattleResult(demoResult);
      } else {
        const result = await response.json();
        setBattleResult(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to simulate battle');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="header">
        <h1>Pokémon Battle Simulator</h1>
        <p>Explore Pokémon data and simulate epic battles!</p>
      </div>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'lookup' ? 'active' : ''}`}
          onClick={() => setActiveTab('lookup')}
        >
          Pokémon Lookup
        </button>
        <button
          className={`tab ${activeTab === 'battle' ? 'active' : ''}`}
          onClick={() => setActiveTab('battle')}
        >
          Battle Simulator
        </button>
      </div>

      {activeTab === 'lookup' && (
        <div className="card">
          <div className="input-group">
            <label htmlFor="pokemon-name">Pokémon Name or ID:</label>
            <input
              id="pokemon-name"
              type="text"
              value={pokemonName}
              onChange={(e) => setPokemonName(e.target.value)}
              placeholder="e.g., pikachu, 25, charizard"
              onKeyPress={(e) => e.key === 'Enter' && lookupPokemon()}
            />
          </div>

          <button
            className="button"
            onClick={lookupPokemon}
            disabled={loading || !pokemonName.trim()}
          >
            {loading ? 'Loading...' : 'Look Up Pokémon'}
          </button>

          {error && <div className="error">{error}</div>}

          {pokemonData && (
            <div className="pokemon-info">
              <div className="pokemon-card">
                <h3>#{pokemonData.id} {pokemonData.name}</h3>

                <div className="types">
                  {pokemonData.types.map(type => (
                    <span key={type} className={`type-badge type-${type}`}>
                      {type}
                    </span>
                  ))}
                </div>

                <div className="stats-grid">
                  <div className="stat">
                    <span>HP:</span>
                    <span>{pokemonData.base_stats.hp}</span>
                  </div>
                  <div className="stat">
                    <span>Attack:</span>
                    <span>{pokemonData.base_stats.attack}</span>
                  </div>
                  <div className="stat">
                    <span>Defense:</span>
                    <span>{pokemonData.base_stats.defense}</span>
                  </div>
                  <div className="stat">
                    <span>Sp. Atk:</span>
                    <span>{pokemonData.base_stats.special_attack}</span>
                  </div>
                  <div className="stat">
                    <span>Sp. Def:</span>
                    <span>{pokemonData.base_stats.special_defense}</span>
                  </div>
                  <div className="stat">
                    <span>Speed:</span>
                    <span>{pokemonData.base_stats.speed}</span>
                  </div>
                </div>

                <p><strong>Height:</strong> {pokemonData.height / 10}m</p>
                <p><strong>Weight:</strong> {pokemonData.weight / 10}kg</p>

                <p><strong>Abilities:</strong> {pokemonData.abilities.join(', ')}</p>

                <p><strong>Evolution Chain:</strong> {pokemonData.evolution_chain.join(' → ')}</p>

                <p><strong>Sample Moves:</strong> {pokemonData.moves.slice(0, 5).map(m => m.name).join(', ')}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'battle' && (
        <div className="card">
          <div className="input-group">
            <label htmlFor="pokemon-a">Pokémon A:</label>
            <input
              id="pokemon-a"
              type="text"
              value={battlePokemonA}
              onChange={(e) => setBattlePokemonA(e.target.value)}
              placeholder="e.g., charizard"
            />
          </div>

          <div className="input-group">
            <label htmlFor="pokemon-b">Pokémon B:</label>
            <input
              id="pokemon-b"
              type="text"
              value={battlePokemonB}
              onChange={(e) => setBattlePokemonB(e.target.value)}
              placeholder="e.g., blastoise"
            />
          </div>

          <button
            className="button"
            onClick={simulateBattle}
            disabled={loading || !battlePokemonA.trim() || !battlePokemonB.trim()}
          >
            {loading ? 'Simulating...' : 'Start Battle!'}
          </button>

          {error && <div className="error">{error}</div>}

          {battleResult && (
            <div className="battle-log">
              <h3>Battle Result: {battleResult.result === 'draw' ? 'Draw!' : `${battleResult.result} wins!`}</h3>

              <div style={{ marginBottom: '20px' }}>
                <strong>Participants:</strong>
                {battleResult.participants.map((p, i) => (
                  <span key={i} style={{ marginLeft: '10px' }}>
                    {p.name} ({p.types.join('/')})
                  </span>
                ))}
              </div>

              {battleResult.log.map((line, index) => (
                <div
                  key={index}
                  className={`log-line ${line.includes('Turn') ? 'turn' :
                      line.includes('HP |') ? 'hp' : ''
                    }`}
                >
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
