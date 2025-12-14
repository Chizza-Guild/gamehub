"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-client";
import { RealtimeChannel } from "@supabase/supabase-js";

type Player = {
	id: string;
	name: string;
	joinedAt: number;
};

type LobbyInfo = {
	players: Player[];
	adminId: string;
	settings: {
		maxPlayers: number;
		isPrivate: boolean;
	};
};

type Lobby = {
	id: string;
	code: string;
	game_type: string | null;
	lobby_info: LobbyInfo;
};

export default function LobbyPage() {
	const params = useParams();
	const router = useRouter();
	const lobbyCode = params.lobby_code as string;

	const [lobby, setLobby] = useState<Lobby | null>(null);
	const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [gameType, setGameType] = useState<string>("");
	const [channel, setChannel] = useState<RealtimeChannel | null>(null);

	const supabase = createClient();

	// Initialize lobby
	useEffect(() => {
		async function initializeLobby() {
			try {
				// Get or create player ID
				let playerId = localStorage.getItem("playerId");
				let playerName = localStorage.getItem("playerName");

				if (!playerId) {
					playerId = crypto.randomUUID();
					localStorage.setItem("playerId", playerId);
				}

				if (!playerName) {
					playerName = `Player${Math.floor(Math.random() * 1000)}`;
					localStorage.setItem("playerName", playerName);
				}

				// Fetch lobby
				const { data: lobbyData, error: fetchError } = await supabase.from("lobbies").select("*").eq("code", lobbyCode).single();

				if (fetchError || !lobbyData) {
					setError("Lobby not found");
					setLoading(false);
					return;
				}

				const newPlayer: Player = {
					id: playerId,
					name: playerName,
					joinedAt: Date.now(),
				};

				let updatedLobbyInfo: LobbyInfo;

				// Check if lobby_info exists and has players
				if (lobbyData.lobby_info && lobbyData.lobby_info.players) {
					const existingPlayers = lobbyData.lobby_info.players as Player[];
					const playerExists = existingPlayers.some(p => p.id === playerId);

					if (!playerExists) {
						// Add new player
						updatedLobbyInfo = {
							...lobbyData.lobby_info,
							players: [...existingPlayers, newPlayer],
						};
					} else {
						// Player already exists
						updatedLobbyInfo = lobbyData.lobby_info;
					}
				} else {
					// First player - becomes admin
					updatedLobbyInfo = {
						players: [newPlayer],
						adminId: playerId,
						settings: {
							maxPlayers: 8,
							isPrivate: false,
						},
					};
				}

				// Update lobby
				const { data: updatedLobby, error: updateError } = await supabase.from("lobbies").update({ lobby_info: updatedLobbyInfo }).eq("id", lobbyData.id).select().single();

				if (updateError || !updatedLobby) {
					setError("Failed to join lobby");
					setLoading(false);
					return;
				}

				setLobby(updatedLobby);
				setCurrentPlayer(newPlayer);
				setGameType(updatedLobby.game_type || "");
				setLoading(false);

				// Setup realtime subscription
				const realtimeChannel = supabase
					.channel(`lobby:${lobbyData.id}`)
					.on(
						"postgres_changes",
						{
							event: "UPDATE",
							schema: "public",
							table: "lobbies",
							filter: `id=eq.${lobbyData.id}`,
						},
						payload => {
							setLobby(payload.new as Lobby);
							setGameType((payload.new as Lobby).game_type || "");
						}
					)
					.subscribe();

				setChannel(realtimeChannel);
			} catch (err) {
				console.error(err);
				setError("An error occurred");
				setLoading(false);
			}
		}

		initializeLobby();

		return () => {
			if (channel) {
				channel.unsubscribe();
			}
		};
	}, [lobbyCode]);

	const isAdmin = currentPlayer?.id === lobby?.lobby_info?.adminId;

	const handleGameTypeChange = async (newGameType: string) => {
		if (!isAdmin || !lobby) return;

		const { error } = await supabase.from("lobbies").update({ game_type: newGameType }).eq("id", lobby.id);

		if (error) {
			console.error("Failed to update game type:", error);
		}
	};

	const handleMaxPlayersChange = async (maxPlayers: number) => {
		if (!isAdmin || !lobby) return;

		const updatedInfo = {
			...lobby.lobby_info,
			settings: {
				...lobby.lobby_info.settings,
				maxPlayers,
			},
		};

		const { error } = await supabase.from("lobbies").update({ lobby_info: updatedInfo }).eq("id", lobby.id);

		if (error) {
			console.error("Failed to update max players:", error);
		}
	};

	const handleLeaveLobby = async () => {
		if (!lobby || !currentPlayer) return;

		const updatedPlayers = lobby.lobby_info.players.filter(p => p.id !== currentPlayer.id);

		let updatedInfo = { ...lobby.lobby_info, players: updatedPlayers };

		// If admin leaves and there are other players, assign new admin
		if (isAdmin && updatedPlayers.length > 0) {
			updatedInfo.adminId = updatedPlayers[0].id;
		}

		await supabase.from("lobbies").update({ lobby_info: updatedInfo }).eq("id", lobby.id);

		router.push("/");
	};

	if (loading) {
		return (
			<div className="min-h-screen bg-gray-900 flex items-center justify-center">
				<div className="text-white text-xl">Loading lobby...</div>
			</div>
		);
	}

	if (error || !lobby) {
		return (
			<div className="min-h-screen bg-gray-900 flex items-center justify-center">
				<div className="text-center">
					<div className="text-red-500 text-xl mb-4">{error || "Lobby not found"}</div>
					<button onClick={() => router.push("/")} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
						Back to Menu
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-gray-900 text-white p-8">
			<div className="max-w-6xl mx-auto">
				{/* Header */}
				<div className="mb-8">
					<h1 className="text-4xl font-bold mb-2">Lobby: {lobby.code}</h1>
					<p className="text-gray-400">
						{lobby.lobby_info.players.length}/{lobby.lobby_info.settings.maxPlayers} players
					</p>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-8">
					{/* Left: Player List */}
					<div className="bg-gray-800 rounded-lg p-6">
						<h2 className="text-2xl font-bold mb-4">Players</h2>
						<div className="space-y-3">
							{lobby.lobby_info.players.map(player => (
								<div key={player.id} className={`p-3 rounded ${player.id === currentPlayer?.id ? "bg-blue-600" : "bg-gray-700"}`}>
									<div className="flex items-center justify-between">
										<span className="font-medium">{player.name}</span>
										{player.id === lobby.lobby_info.adminId && <span className="text-xs bg-yellow-600 px-2 py-1 rounded">ADMIN</span>}
									</div>
								</div>
							))}
						</div>
					</div>

					{/* Right: Game Settings (Admin Only) */}
					<div className="bg-gray-800 rounded-lg p-6">
						<h2 className="text-2xl font-bold mb-4">Game Settings</h2>

						{isAdmin ? (
							<div className="space-y-6">
								{/* Game Type Selection */}
								<div>
									<label className="block text-sm font-medium mb-2">Game Type</label>
									<select value={gameType} onChange={e => handleGameTypeChange(e.target.value)} className="w-full px-4 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none">
										<option value="">Select a game...</option>
										<option value="trivia">Trivia</option>
										<option value="drawing">Drawing Game</option>
										<option value="word_game">Word Game</option>
										<option value="cards">Card Game</option>
									</select>
								</div>

								{/* Max Players */}
								<div>
									<label className="block text-sm font-medium mb-2">Max Players: {lobby.lobby_info.settings.maxPlayers}</label>
									<input type="range" min="2" max="16" value={lobby.lobby_info.settings.maxPlayers} onChange={e => handleMaxPlayersChange(parseInt(e.target.value))} className="w-full" />
								</div>

								{/* Start Game Button */}
								<button disabled={!gameType || lobby.lobby_info.players.length < 2} className="w-full px-6 py-3 bg-green-600 text-white rounded font-bold hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed">
									Start Game
								</button>

								{!gameType && <p className="text-sm text-gray-400 text-center">Select a game type to continue</p>}
								{gameType && lobby.lobby_info.players.length < 2 && <p className="text-sm text-gray-400 text-center">Need at least 2 players to start</p>}
							</div>
						) : (
							<div className="text-center py-8">
								<p className="text-gray-400 mb-4">Waiting for the admin to configure the game...</p>
								{gameType && (
									<div className="mt-4">
										<p className="text-sm text-gray-400">Selected Game:</p>
										<p className="text-xl font-bold text-blue-400 capitalize">{gameType.replace("_", " ")}</p>
									</div>
								)}
							</div>
						)}
					</div>
				</div>

				{/* Leave Lobby Button */}
				<div className="mt-8 text-center">
					<button onClick={handleLeaveLobby} className="px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700">
						Leave Lobby
					</button>
				</div>
			</div>
		</div>
	);
}
