"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";

export default function Home() {
	const router = useRouter();
	const [creating, setCreating] = useState(false);
	const [joinCode, setJoinCode] = useState("");
	type Lobby = {
		id: number;
		code: string;
		game_type: string | null;
		lobby_info: any | null;
		created_at: string;
	};
	
	useEffect(() => {
		let channel: any;

		async function loadLobbies() {
			const { data, error } = await supabase
				.from("lobbies")
				.select("*")
				.order("created_at", { ascending: false });

			if (!error && data) {
				setLobbies(data);
			}
		}

		loadLobbies();

		// Realtime subscription
		channel = supabase
			.channel("public:lobbies")
			.on(
				"postgres_changes",
				{ event: "*", schema: "public", table: "lobbies" },
				() => {
					loadLobbies();
				}
			)
			.subscribe();

		return () => {
			if (channel) supabase.removeChannel(channel);
		};
	}, []);
	
	function getPlayerCount(lobby: Lobby) {
		const players = lobby.lobby_info?.players;
		return Array.isArray(players) ? players.length : 0;
	}

	function getMaxPlayers(lobby: Lobby) {
		return lobby.lobby_info?.maxPlayers ?? 8;
	}



	const [lobbies, setLobbies] = useState<Lobby[]>([]);

	function joinLobby() {
		const code = joinCode.trim().toUpperCase();

		if (!code) {
			alert("Please enter a lobby code");
			return;
		}

		router.push(`/lobby/${code}`);
	}

	async function createLobby() {
		setCreating(true);
		try {
			// Generate 6-character lobby code
			const code = Math.random().toString(36).substring(2, 8).toUpperCase();

			// Create lobby in database with NO initial lobby_info
			// Let the lobby page set it up when first player joins
			const { data, error } = await supabase
				.from("lobbies")
				// @ts-expect-error - Supabase type inference issue with Database generic
				.insert({
					code,
					game_type: null,
					lobby_info: null, // Changed from empty object to null
				})
				.select()
				.single();

			if (error) {
				console.error("Failed to create lobby:", error);
				console.error("Error details:", JSON.stringify(error, null, 2));
				alert(`Failed to create lobby: ${error.message || "Unknown error"}`);
				setCreating(false);
				return;
			}

			// Navigate to the lobby page
			router.push(`/lobby/${code}`);
		} catch (err) {
			console.error("Error creating lobby:", err);
			alert("An error occurred. Please try again.");
			setCreating(false);
		}
	}

	return (
		<div className="min-h-screen bg-gray-900 text-white p-8">
			<h1 className="text-4xl font-bold mb-8">Game Hub</h1>

			{/* Create Lobby Button */}
			<div className="mb-8">
				<button onClick={createLobby} disabled={creating} className="px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-bold text-lg transition disabled:bg-gray-600 disabled:cursor-not-allowed">
					{creating ? "Creating Lobby..." : "🎲 Create Lobby"}
				</button>
				<p className="text-gray-400 text-sm mt-2">Create a multiplayer lobby and invite friends</p>
			</div>
			
			{/* Join Lobby */}
			<div className="mb-12">
				<div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
					<div>
						<label className="block text-sm font-semibold mb-1 text-gray-300">
							Lobby Code
						</label>
						<input
							type="text"
							value={joinCode}
							onChange={(e) => setJoinCode(e.target.value)}
							maxLength={6}
							placeholder="ABC123"
							className="px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 uppercase tracking-widest"
						/>
					</div>

					<button
						onClick={joinLobby}
						className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-bold text-lg transition"
					>
						🚪 Join Lobby
					</button>
				</div>

				<p className="text-gray-400 text-sm mt-2">
					Enter a lobby code shared by a friend
				</p>
			</div>
			<h2 className="text-2xl font-bold mb-4">🌍 Public Lobbies</h2>

			<div className="space-y-3 max-w-4xl">
				{lobbies.length === 0 && (
					<p className="text-gray-400">No lobbies available yet</p>
				)}

				{lobbies
					.filter((lobby) => getPlayerCount(lobby) > 0)
					.map((lobby) => {
					const players = getPlayerCount(lobby);
					const maxPlayers = getMaxPlayers(lobby);

					return (
						<div
							key={lobby.code}
							className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 bg-gray-800 rounded-lg border border-gray-700"
						>
							<div>
								<div className="font-mono text-lg tracking-widest">
									{lobby.code}
								</div>
								<div className="text-sm text-gray-400">
									{lobby.game_type ?? "Not started yet"} •{" "}
									{players} / {maxPlayers} players
								</div>
								<div className="text-xs text-gray-500">
									Created {new Date(lobby.created_at).toLocaleString()}
								</div>
							</div>

							<button
								onClick={() => router.push(`/lobby/${lobby.code}`)}
								className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition disabled:bg-gray-600"
								disabled={players >= maxPlayers}
							>
								{players >= maxPlayers ? "Full" : "Join"}
							</button>
						</div>
					);
				})}
			</div>



			<h2 className="text-2xl font-bold mb-4">Quick Play Games</h2>
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl">
				<Link href="/games/maze" className="p-6 bg-gray-800 hover:bg-gray-700 rounded-lg border-2 border-gray-700 hover:border-blue-500 transition">
					<h2 className="text-2xl font-bold mb-2">🎮 Maze</h2>
					<p className="text-gray-400">3D first-person maze game</p>
				</Link>

				<Link href="/games/dance" className="p-6 bg-gray-800 hover:bg-gray-700 rounded-lg border-2 border-gray-700 hover:border-blue-500 transition">
					<h2 className="text-2xl font-bold mb-2">🎵 Dodo Re Mi</h2>
					<p className="text-gray-400">Multiplayer rhythm game (2-8 players)</p>
				</Link>

				<Link href="/games/ruined" className="p-6 bg-gray-800 hover:bg-gray-700 rounded-lg border-2 border-gray-700 hover:border-blue-500 transition">
					<h2 className="text-2xl font-bold mb-2">🎮 Ruin & Unruin</h2>
					<p className="text-gray-400">Party game</p>
				</Link>
			</div>
		</div>
	);
}
