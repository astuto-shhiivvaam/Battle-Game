import fetch from "node-fetch";
import { z } from "zod";
import { SimpleCache } from "../lib/cache.js";
const PokemonQuerySchema = z.object({
    name: z.string().optional(),
    id: z.number().int().positive().optional(),
});
const cache = new SimpleCache(60_000);
export function createPokemonResource() {
    return {
        uri: "resource://pokemon/data",
        name: "Pokemon Data",
        description: "Comprehensive Pokémon data from PokeAPI with base stats, types, abilities, moves, and evolution.",
        mimeType: "application/json",
        schema: PokemonQuerySchema,
        async read(params) {
            const { name, id } = params ?? {};
            if (!name && !id) {
                // Provide index of available pokemon (first page) to guide discovery
                const listResp = await fetch("https://pokeapi.co/api/v2/pokemon?limit=2000");
                const listData = await listResp.json();
                return {
                    results: listData.results.map(r => r.name),
                    hint: "Provide {name} or {id} to get full details.",
                };
            }
            const identifier = (name ?? String(id)).toLowerCase();
            const cached = cache.get(`pokemon:${identifier}`);
            if (cached)
                return cached;
            const [pokemonResp, speciesResp] = await Promise.all([
                fetch(`https://pokeapi.co/api/v2/pokemon/${identifier}`),
                fetch(`https://pokeapi.co/api/v2/pokemon-species/${identifier}`),
            ]);
            if (!pokemonResp.ok)
                throw new Error(`Pokemon not found: ${identifier}`);
            const pokemon = await pokemonResp.json();
            const species = await speciesResp.json();
            // Evolution chain
            const evoResp = await fetch(species.evolution_chain.url);
            const evo = await evoResp.json();
            const evolutionChain = [];
            function traverse(node) {
                evolutionChain.push(node.species.name);
                node.evolves_to?.forEach(traverse);
            }
            traverse(evo.chain);
            const data = {
                id: pokemon.id,
                name: pokemon.name,
                types: pokemon.types.map((t) => t.type.name),
                base_stats: pokemon.stats.reduce((acc, s) => {
                    const key = s.stat.name.replace("-", "_");
                    acc[key] = s.base_stat;
                    return acc;
                }, {}),
                abilities: pokemon.abilities.map((a) => a.ability.name),
                moves: pokemon.moves.map((m) => ({ name: m.move.name })),
                height: pokemon.height,
                weight: pokemon.weight,
                evolution_chain: evolutionChain,
                sprites: pokemon.sprites,
            };
            cache.set(`pokemon:${identifier}`, data);
            return data;
        },
    };
}
