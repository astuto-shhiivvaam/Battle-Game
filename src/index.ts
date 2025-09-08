import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fetch from "node-fetch";
import { z } from "zod";
import { SimpleCache } from "./lib/cache.js";

// Shared helpers
const apiCache = new SimpleCache<any>(60_000);

async function fetchJson<T>(url: string): Promise<T> {
  const hit = apiCache.get(url);
  if (hit) return hit as T;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Request failed ${resp.status}: ${url}`);
  const data = (await resp.json()) as T;
  apiCache.set(url, data);
  return data;
}

type PokemonData = {
  name: string;
  stats: Record<string, number>;
  types: string[];
  moves: { name: string; power?: number; type?: string; accuracy?: number; category?: "physical" | "special" }[];
  speed: number;
};

async function getPokemon(identifier: string): Promise<PokemonData> {
  const id = identifier.toLowerCase();
  const p = await fetchJson<any>(`https://pokeapi.co/api/v2/pokemon/${id}`);
  const stats: Record<string, number> = {};
  for (const s of p.stats as any[]) {
    stats[s.stat.name] = s.base_stat;
  }
  const moves = await Promise.all(
    (p.moves as any[]).slice(0, 30).map(async (m: any) => {
      const md = await fetchJson<any>(m.move.url);
      return {
        name: md.name,
        power: md.power ?? undefined,
        type: md.type?.name,
        accuracy: md.accuracy ?? undefined,
        category: md.damage_class?.name,
      } as const;
    })
  );
  const filtered = moves.filter(
    (m) => m.power && (m.category === "physical" || m.category === "special")
  );
  return {
    name: p.name,
    stats,
    types: (p.types as any[]).map((t: any) => t.type.name),
    moves: filtered.slice(0, 4),
    speed: stats["speed"] ?? 50,
  };
}

const typeChart: Record<string, Record<string, number>> = {
  fire: { grass: 2, ice: 2, bug: 2, steel: 2, water: 0.5, rock: 0.5, fire: 0.5, dragon: 0.5 },
  water: { fire: 2, rock: 2, ground: 2, water: 0.5, grass: 0.5, dragon: 0.5 },
  grass: { water: 2, ground: 2, rock: 2, fire: 0.5, grass: 0.5, poison: 0.5, flying: 0.5, bug: 0.5, dragon: 0.5, steel: 0.5 },
  electric: { water: 2, flying: 2, electric: 0.5, grass: 0.5, dragon: 0.5, ground: 0 },
  ice: { grass: 2, ground: 2, flying: 2, dragon: 2, fire: 0.5, water: 0.5, ice: 0.5, steel: 0.5 },
  fighting: { normal: 2, ice: 2, rock: 2, dark: 2, steel: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, fairy: 0.5, ghost: 0 },
  poison: { grass: 2, fairy: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0 },
  ground: { fire: 2, electric: 2, poison: 2, rock: 2, steel: 2, grass: 0.5, bug: 0.5, flying: 0 },
  flying: { grass: 2, fighting: 2, bug: 2, electric: 0.5, rock: 0.5, steel: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, steel: 0.5, dark: 0 },
  bug: { grass: 2, psychic: 2, dark: 2, fire: 0.5, fighting: 0.5, poison: 0.5, flying: 0.5, ghost: 0.5, steel: 0.5, fairy: 0.5 },
  rock: { fire: 2, ice: 2, flying: 2, bug: 2, fighting: 0.5, ground: 0.5, steel: 0.5 },
  ghost: { psychic: 2, ghost: 2, dark: 0.5, normal: 0 },
  dragon: { dragon: 2, steel: 0.5, fairy: 0 },
  dark: { psychic: 2, ghost: 2, fighting: 0.5, dark: 0.5, fairy: 0.5 },
  steel: { ice: 2, rock: 2, fairy: 2, fire: 0.5, water: 0.5, electric: 0.5, steel: 0.5 },
  fairy: { fighting: 2, dragon: 2, dark: 2, fire: 0.5, poison: 0.5, steel: 0.5 },
  normal: { rock: 0.5, steel: 0.5, ghost: 0 },
};

function typeEffectiveness(moveType: string, defenderTypes: string[]): number {
  let multiplier = 1;
  for (const def of defenderTypes) {
    const map = typeChart[moveType] || {};
    multiplier *= map[def] ?? 1;
  }
  return multiplier;
}

type Status = null | { kind: "paralysis" | "burn" | "poison" };

function calculateDamage(attacker: PokemonData, defender: PokemonData, move: any): number {
  const level = 50;
  const isPhysical = move.category === "physical";
  const attackStat = isPhysical ? (attacker.stats["attack"] ?? 50) : (attacker.stats["special-attack"] ?? 50);
  const defenseStat = isPhysical ? (defender.stats["defense"] ?? 50) : (defender.stats["special-defense"] ?? 50);
  let base = Math.floor(((2 * level) / 5 + 2) * (move.power ?? 40) * (attackStat / Math.max(1, defenseStat)) / 50) + 2;
  const stab = attacker.types.includes(move.type) ? 1.5 : 1.0;
  const eff = typeEffectiveness(move.type, defender.types);
  const rand = 0.85 + Math.random() * 0.15;
  return Math.max(1, Math.floor(base * stab * eff * rand));
}

async function main() {
  const mcp = new McpServer({ name: "pokemon-mcp-server", version: "0.1.0" });

  // Resource: Pokemon Data (query via URL params: ?name=pikachu or ?id=25)
  mcp.registerResource(
    "pokemon-data",
    "resource://pokemon/data",
    {
      title: "Pokemon Data",
      description: "Comprehensive Pokémon data from PokeAPI with base stats, types, abilities, moves, and evolution.",
      mimeType: "application/json",
    },
    async (uri: URL) => {
      const name = uri.searchParams.get("name") ?? undefined;
      const id = uri.searchParams.get("id") ?? undefined;
      if (!name && !id) {
        const list = await fetchJson<any>("https://pokeapi.co/api/v2/pokemon?limit=2000");
        return {
          contents: [
            {
              uri: uri.toString(),
              mimeType: "application/json",
              text: JSON.stringify({
                results: (list.results as any[]).map((r: any) => r.name),
                hint: "Append ?name=pikachu or ?id=25 to this resource URI.",
              }),
            },
          ],
        };
      }
      const identifier = (name ?? id!) as string;
      const pokemon = await fetchJson<any>(`https://pokeapi.co/api/v2/pokemon/${identifier.toLowerCase()}`);
      const species = await fetchJson<any>(`https://pokeapi.co/api/v2/pokemon-species/${identifier.toLowerCase()}`);
      const evo = await fetchJson<any>(species.evolution_chain.url);
      const chain: string[] = [];
      const traverse = (node: any) => {
        chain.push(node.species.name);
        for (const next of node.evolves_to ?? []) traverse(next);
      };
      traverse(evo.chain);
      const data = {
        id: pokemon.id,
        name: pokemon.name,
        types: (pokemon.types as any[]).map((t: any) => t.type.name),
        base_stats: (pokemon.stats as any[]).reduce((acc: any, s: any) => {
          const key = (s.stat.name as string).replace("-", "_");
          acc[key] = s.base_stat; return acc;
        }, {} as Record<string, number>),
        abilities: (pokemon.abilities as any[]).map((a: any) => a.ability.name),
        moves: (pokemon.moves as any[]).map((m: any) => ({ name: m.move.name })),
        height: pokemon.height,
        weight: pokemon.weight,
        evolution_chain: chain,
        sprites: pokemon.sprites,
      };
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(data),
          },
        ],
      };
    }
  );

  // Tool: simulate_battle
  const BattleInput = { pokemonA: z.string(), pokemonB: z.string() } as const;
  mcp.registerTool(
    "simulate_battle",
    { description: "Simulate a Pokémon battle between two Pokémon.", inputSchema: BattleInput },
    async ({ pokemonA, pokemonB }) => {
      const a = await getPokemon(pokemonA);
      const b = await getPokemon(pokemonB);

      let aHpMax = (a.stats["hp"] ?? 60) * 2;
      let bHpMax = (b.stats["hp"] ?? 60) * 2;
      let aHp = aHpMax;
      let bHp = bHpMax;
      let aStatus: Status = null;
      let bStatus: Status = null;
      const log: string[] = [];

      function chooseMove(p: PokemonData, opponent: PokemonData) {
        const scored = p.moves.map((m) => ({ m, score: (m.power ?? 40) * typeEffectiveness(m.type ?? "normal", opponent.types) }));
        scored.sort((x, y) => y.score - x.score);
        return scored[0]?.m ?? { name: "tackle", power: 40, type: "normal", category: "physical" };
      }

      let turn = 1;
      while (aHp > 0 && bHp > 0 && turn <= 100) {
        log.push(`-- Turn ${turn} --`);
        const aMove = chooseMove(a, b);
        const bMove = chooseMove(b, a);
        const aSpeedEff = Math.floor(a.speed * (aStatus?.kind === "paralysis" ? 0.5 : 1));
        const bSpeedEff = Math.floor(b.speed * (bStatus?.kind === "paralysis" ? 0.5 : 1));
        const order: ("A" | "B")[] = aSpeedEff >= bSpeedEff ? ["A", "B"] : ["B", "A"];
        for (const who of order) {
          if (aHp <= 0 || bHp <= 0) break;
          const isA = who === "A";
          const atk = isA ? a : b;
          const def = isA ? b : a;
          const atkStatus = isA ? aStatus : bStatus;
          const defStatus = isA ? bStatus : aStatus;
          const atkMove = isA ? aMove : bMove;
          if (atkStatus?.kind === "paralysis" && Math.random() < 0.25) {
            log.push(`${isA ? a.name : b.name} is fully paralyzed and can't move!`);
          } else {
            if (atkMove.accuracy && Math.random() * 100 > atkMove.accuracy) {
              log.push(`${isA ? a.name : b.name} used ${atkMove.name}, but it missed!`);
            } else {
              const damage = calculateDamage(atk, def, atkMove);
              if (isA) { bHp = Math.max(0, bHp - damage); } else { aHp = Math.max(0, aHp - damage); }
              const eff = typeEffectiveness(atkMove.type ?? "normal", def.types);
              const effNote = eff > 1 ? "It's super effective!" : eff < 1 && eff > 0 ? "It's not very effective..." : eff === 0 ? "It doesn't affect the foe..." : "";
              log.push(`${isA ? a.name : b.name} used ${atkMove.name} and dealt ${damage} damage. ${effNote}`.trim());
              if (!defStatus && Math.random() < 0.2) {
                const inflicted: Status = atkMove.type === "electric" ? { kind: "paralysis" } : atkMove.type === "fire" ? { kind: "burn" } : atkMove.type === "poison" ? { kind: "poison" } : null;
                if (inflicted) {
                  if (isA) bStatus = inflicted; else aStatus = inflicted;
                  log.push(`${isA ? b.name : a.name} is afflicted by ${inflicted.kind}!`);
                }
              }
            }
          }
          if (aHp <= 0 || bHp <= 0) break;
          const targetStatus = isA ? bStatus : aStatus;
          if (targetStatus?.kind === "burn") {
            if (isA) { bHp = Math.max(0, bHp - Math.floor(bHpMax * 0.0625)); } else { aHp = Math.max(0, aHp - Math.floor(aHpMax * 0.0625)); }
            log.push(`${isA ? b.name : a.name} is hurt by its burn!`);
          } else if (targetStatus?.kind === "poison") {
            if (isA) { bHp = Math.max(0, bHp - Math.floor(bHpMax * 0.125)); } else { aHp = Math.max(0, aHp - Math.floor(aHpMax * 0.125)); }
            log.push(`${isA ? b.name : a.name} is hurt by poison!`);
          }
        }
        log.push(`${a.name}: ${aHp}/${aHpMax} HP | ${b.name}: ${bHp}/${bHpMax} HP`);
        turn++;
      }
      const winner = aHp > 0 && bHp <= 0 ? a.name : bHp > 0 && aHp <= 0 ? b.name : aHp === bHp ? "draw" : aHp > bHp ? a.name : b.name;
      const result = {
        participants: [{ name: a.name, types: a.types }, { name: b.name, types: b.types }],
        log,
        result: winner,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    }
  );

  const transport = new StdioServerTransport();
  await mcp.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
