"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-client";
import { RealtimeChannel } from "@supabase/supabase-js";
import "./styles.css";

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
	const lobbyCode = params.code as string;

	const [lobby, setLobby] = useState<Lobby | null>(null);
	const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [gameType, setGameType] = useState<string>("");
	const [channel, setChannel] = useState<RealtimeChannel | null>(null);

	const supabase = createClient();

	// Initialize lobby
	useEffect(() => {
		if (!lobbyCode || lobbyCode.length < 4) {
			setError("Invalid lobby code");
			setLoading(false);
			return;
		}

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

				// Check if this is the first player (no lobby_info or empty players array or no adminId)
				if (!lobbyData.lobby_info || !lobbyData.lobby_info.players || lobbyData.lobby_info.players.length === 0 || !lobbyData.lobby_info.adminId) {
					console.log("First player - setting as admin");
					// First player - becomes admin
					updatedLobbyInfo = {
						players: [newPlayer],
						adminId: playerId,
						settings: {
							maxPlayers: 8,
							isPrivate: false,
						},
					};
				} else {
					console.log("Existing lobby with players");
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
			<div className="lobby-container">
				<div className="loading-message">Loading lobby...</div>
			</div>
		);
	}

	if (error || !lobby) {
		return (
			<div className="lobby-container">
				<div className="error-container">
					<div className="error-message">{error || "Lobby not found"}</div>
					<button onClick={() => router.push("/")} className="button button-primary">
						Back to Menu
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="lobby-container">
			<div className="lobby-content">
				{/* Header */}
				<div className="lobby-header">
					<h1 className="lobby-title">Lobby: {lobby.code}</h1>
					<p className="player-count">
						{lobby.lobby_info.players.length}/{lobby.lobby_info.settings.maxPlayers} players
					</p>
				</div>

				<div className="lobby-grid">
					{/* Left: Player List */}
					<div className="card">
						<h2 className="card-title">Players</h2>
						<div className="player-list">
							{lobby.lobby_info.players.map(player => (
								<div key={player.id} className={`player-card ${player.id === currentPlayer?.id ? "player-card-current" : ""}`}>
									<div className="player-info">
										<span className="player-name">{player.name}</span>
										{player.id === lobby.lobby_info.adminId && <span className="admin-badge">ADMIN</span>}
									</div>
								</div>
							))}
						</div>
					</div>

					{/* Right: Game Settings (Admin Only) */}
					<div className="card">
						<h2 className="card-title">Game Settings</h2>

						{isAdmin ? (
							<div className="settings-container">
								{/* Game Type Selection */}
								<div className="form-group">
									<label className="form-label">Game Type</label>
									<select value={gameType} onChange={e => handleGameTypeChange(e.target.value)} className="form-select">
										<option value="">Select a game...</option>
										<option value="trivia">Trivia</option>
										<option value="drawing">Drawing Game</option>
										<option value="word_game">Word Game</option>
										<option value="cards">Card Game</option>
									</select>
								</div>

								{/* Max Players */}
								<div className="form-group">
									<label className="form-label">Max Players: {lobby.lobby_info.settings.maxPlayers}</label>
									<input type="range" min="2" max="16" value={lobby.lobby_info.settings.maxPlayers} onChange={e => handleMaxPlayersChange(parseInt(e.target.value))} className="form-range" />
								</div>

								{/* Start Game Button */}
								<button disabled={!gameType || lobby.lobby_info.players.length < 2} className="button button-success button-full">
									Start Game
								</button>

								{!gameType && <p className="help-text">Select a game type to continue</p>}
								{gameType && lobby.lobby_info.players.length < 2 && <p className="help-text">Need at least 2 players to start</p>}
							</div>
						) : (
							<div className="waiting-container">
								<p className="waiting-message">Waiting for the admin to configure the game...</p>
								{gameType && (
									<div className="selected-game">
										<p className="selected-game-label">Selected Game:</p>
										<p className="selected-game-name">{gameType.replace("_", " ")}</p>
									</div>
								)}
							</div>
						)}
					</div>
				</div>

				{/* Leave Lobby Button */}
				<div className="lobby-footer">
					<button onClick={handleLeaveLobby} className="button button-danger">
						Leave Lobby
					</button>
				</div>
			</div>
		</div>
	);
}
