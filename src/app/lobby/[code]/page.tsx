"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-client";
import { RealtimeChannel } from "@supabase/supabase-js";
import "./styles.css";

type Player = {
	id: string;
	name: string;
	joinedAt: number;
	lastSeen: number;
};

type LobbyInfo = {
	players: Player[];
	adminId: string;
	settings: {
		maxPlayers: number;
		isPrivate: boolean;
		mutedPlayers: string[];
	};
};

type Lobby = {
	id: string;
	code: string;
	game_type: string | null;
	lobby_info: LobbyInfo;
	last_activity: string;
};

type Message = {
	id: string;
	lobby_id: string;
	player_id: string | null;
	player_name: string | null;
	message: string;
	is_system: boolean;
	created_at: string;
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
	const [messagesChannel, setMessagesChannel] = useState<RealtimeChannel | null>(null);
	const [messages, setMessages] = useState<Message[]>([]);
	const [messageInput, setMessageInput] = useState("");

	const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
	const cleanupIntervalRef = useRef<NodeJS.Timeout | null>(null);
	const messagesEndRef = useRef<HTMLDivElement | null>(null);

	const supabase = createClient();
	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
	const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

	// Auto-scroll to bottom of messages
	const scrollToBottom = () => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	};

	useEffect(() => {
		scrollToBottom();
	}, [messages]);

	// Send system message
	const sendSystemMessage = async (message: string) => {
		if (!lobby) return;

		await supabase.from("lobby_messages").insert({
			lobby_id: lobby.id,
			player_id: null,
			player_name: null,
			message,
			is_system: true,
		});
	};

	// Heartbeat: Update player's lastSeen timestamp every 10 seconds
	useEffect(() => {
		if (!lobby || !currentPlayer) return;

		const sendHeartbeat = async () => {
			const now = Date.now();
			const updatedPlayers = lobby.lobby_info.players.map(p => (p.id === currentPlayer.id ? { ...p, lastSeen: now } : p));

			const updatedInfo = { ...lobby.lobby_info, players: updatedPlayers };

			await supabase.from("lobbies").update({ lobby_info: updatedInfo }).eq("id", lobby.id);
		};

		sendHeartbeat();
		heartbeatIntervalRef.current = setInterval(sendHeartbeat, 10000);

		return () => {
			if (heartbeatIntervalRef.current) {
				clearInterval(heartbeatIntervalRef.current);
			}
		};
	}, [lobby, currentPlayer]);

	// Cleanup: Check for stale players every 15 seconds
	useEffect(() => {
		if (!lobby || !currentPlayer) return;

		const checkStalePlayers = async () => {
			const { data: freshLobby, error: fetchError } = await supabase.from("lobbies").select("*").eq("id", lobby.id).single();

			if (fetchError || !freshLobby) {
				console.error("Failed to fetch lobby for cleanup check:", fetchError);
				return;
			}

			const now = Date.now();
			const staleThreshold = 30000;

			const activePlayers = freshLobby.lobby_info.players.filter((p: Player) => {
				const timeSinceLastSeen = now - (p.lastSeen || p.joinedAt);
				const isStale = timeSinceLastSeen >= staleThreshold;
				if (isStale) {
					console.log(`Player ${p.name} is stale (${Math.floor(timeSinceLastSeen / 1000)}s since last seen)`);
				}
				return !isStale;
			});

			if (activePlayers.length < freshLobby.lobby_info.players.length) {
				console.log(`Removing ${freshLobby.lobby_info.players.length - activePlayers.length} stale player(s)`);

				// Send system messages for removed players
				const removedPlayers = freshLobby.lobby_info.players.filter((p: Player) => !activePlayers.some((ap: Player) => ap.id === p.id));
				for (const player of removedPlayers) {
					await sendSystemMessage(`${player.name} left the lobby (disconnected)`);
				}

				if (activePlayers.length === 0) {
					console.log("No active players left, deleting lobby");
					await supabase.from("lobbies").delete().eq("id", lobby.id);
					router.push("/");
					return;
				}

				let updatedInfo = { ...freshLobby.lobby_info, players: activePlayers };

				const adminStillActive = activePlayers.some((p: Player) => p.id === freshLobby.lobby_info.adminId);
				if (!adminStillActive) {
					updatedInfo.adminId = activePlayers[0].id;
					console.log(`Admin was stale, new admin: ${activePlayers[0].name}`);
					await sendSystemMessage(`${activePlayers[0].name} is now the admin`);
				}

				const { error: updateError } = await supabase.from("lobbies").update({ lobby_info: updatedInfo }).eq("id", lobby.id);

				if (updateError) {
					console.error("Failed to update lobby after removing stale players:", updateError);
				} else {
					console.log("Successfully removed stale players");
				}
			}
		};

		const initialTimeout = setTimeout(checkStalePlayers, 15000);
		cleanupIntervalRef.current = setInterval(checkStalePlayers, 15000);

		return () => {
			clearTimeout(initialTimeout);
			if (cleanupIntervalRef.current) {
				clearInterval(cleanupIntervalRef.current);
			}
		};
	}, [lobby?.id, currentPlayer?.id]);

	// Handle player cleanup on disconnect
	// Add these refs near your other refs
	const lobbyRef = useRef<Lobby | null>(null);
	const playerRef = useRef<Player | null>(null);

	// Keep refs synced with state
	useEffect(() => {
		lobbyRef.current = lobby;
		playerRef.current = currentPlayer;
	}, [lobby, currentPlayer]);

	// FIXED: Heartbeat Effect
	useEffect(() => {
		const sendHeartbeat = async () => {
			const currentLobby = lobbyRef.current;
			const currentPlayer = playerRef.current;

			if (!currentLobby || !currentPlayer) return;

			const now = Date.now();
			const updatedPlayers = currentLobby.lobby_info.players.map(p => (p.id === currentPlayer.id ? { ...p, lastSeen: now } : p));

			const updatedInfo = { ...currentLobby.lobby_info, players: updatedPlayers };

			console.log("Sending heartbeat...");
			await supabase.from("lobbies").update({ lobby_info: updatedInfo }).eq("id", currentLobby.id);
		};

		// Only set the interval. Do not call sendHeartbeat() immediately here.
		heartbeatIntervalRef.current = setInterval(sendHeartbeat, 10000);

		return () => {
			if (heartbeatIntervalRef.current) {
				clearInterval(heartbeatIntervalRef.current);
			}
		};
	}, []);

	// FIXED: Cleanup Stale Players Effect
	useEffect(() => {
		const checkStalePlayers = async () => {
			const currentLobby = lobbyRef.current;
			if (!currentLobby) return;

			const { data: freshLobby, error: fetchError } = await supabase.from("lobbies").select("*").eq("id", currentLobby.id).single();

			if (fetchError || !freshLobby) {
				console.error("Failed to fetch lobby for cleanup check:", fetchError);
				return;
			}

			const now = Date.now();
			const staleThreshold = 30000;

			const activePlayers = freshLobby.lobby_info.players.filter((p: Player) => {
				const timeSinceLastSeen = now - (p.lastSeen || p.joinedAt);
				const isStale = timeSinceLastSeen >= staleThreshold;
				if (isStale) {
					console.log(`Player ${p.name} is stale`);
				}
				return !isStale;
			});

			if (activePlayers.length < freshLobby.lobby_info.players.length) {
				const removedPlayers = freshLobby.lobby_info.players.filter((p: Player) => !activePlayers.some((ap: Player) => ap.id === p.id));

				for (const player of removedPlayers) {
					await sendSystemMessage(`${player.name} left the lobby (disconnected)`);
				}

				if (activePlayers.length === 0) {
					console.log("No active players left, deleting lobby");
					await supabase.from("lobbies").delete().eq("id", currentLobby.id);
					router.push("/");
					return;
				}

				let updatedInfo = { ...freshLobby.lobby_info, players: activePlayers };

				const adminStillActive = activePlayers.some((p: Player) => p.id === freshLobby.lobby_info.adminId);
				if (!adminStillActive) {
					updatedInfo.adminId = activePlayers[0].id;
					console.log(`New admin: ${activePlayers[0].name}`);
					await sendSystemMessage(`${activePlayers[0].name} is now the admin`);
				}

				const { error: updateError } = await supabase.from("lobbies").update({ lobby_info: updatedInfo }).eq("id", currentLobby.id);

				if (updateError) {
					console.error("Failed to update lobby:", updateError);
				}
			}
		};

		// Only set interval, dependencies are empty because we use refs
		const initialTimeout = setTimeout(checkStalePlayers, 15000);
		cleanupIntervalRef.current = setInterval(checkStalePlayers, 15000);

		return () => {
			clearTimeout(initialTimeout);
			if (cleanupIntervalRef.current) {
				clearInterval(cleanupIntervalRef.current);
			}
		};
	}, []);

	// FIXED: Handle Before Unload
	useEffect(() => {
		const handleBeforeUnload = () => {
			const currentLobby = lobbyRef.current;
			const currentPlayer = playerRef.current;

			if (currentLobby && currentPlayer) {
				const updatedPlayers = currentLobby.lobby_info.players.filter(p => p.id !== currentPlayer.id);

				if (updatedPlayers.length === 0) {
					fetch(`${supabaseUrl}/rest/v1/lobbies?id=eq.${currentLobby.id}`, {
						method: "DELETE",
						headers: {
							"Content-Type": "application/json",
							apikey: supabaseKey,
							Authorization: `Bearer ${supabaseKey}`,
						},
						keepalive: true,
					});
				} else {
					let updatedInfo = { ...currentLobby.lobby_info, players: updatedPlayers };

					if (currentPlayer.id === currentLobby.lobby_info.adminId) {
						updatedInfo.adminId = updatedPlayers[0].id;
					}

					fetch(`${supabaseUrl}/rest/v1/lobbies?id=eq.${currentLobby.id}`, {
						method: "PATCH",
						headers: {
							"Content-Type": "application/json",
							apikey: supabaseKey,
							Authorization: `Bearer ${supabaseKey}`,
							Prefer: "return=minimal",
						},
						body: JSON.stringify({ lobby_info: updatedInfo }),
						keepalive: true,
					});
				}
			}
		};

		window.addEventListener("beforeunload", handleBeforeUnload);

		return () => {
			window.removeEventListener("beforeunload", handleBeforeUnload);
		};
	}, []);

	// Initialize lobby
	useEffect(() => {
		if (!lobbyCode || lobbyCode.length < 4) {
			setError("Invalid lobby code");
			setLoading(false);
			return;
		}

		async function initializeLobby() {
			try {
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

				const { data: lobbyData, error: fetchError } = await supabase.from("lobbies").select("*").eq("code", lobbyCode).single();

				if (fetchError || !lobbyData) {
					setError("Lobby not found");
					setLoading(false);
					return;
				}

				const now = Date.now();
				const newPlayer: Player = {
					id: playerId,
					name: playerName,
					joinedAt: now,
					lastSeen: now,
				};

				let updatedLobbyInfo: LobbyInfo;
				let isNewPlayer = false;

				if (!lobbyData.lobby_info || !lobbyData.lobby_info.players || lobbyData.lobby_info.players.length === 0 || !lobbyData.lobby_info.adminId) {
					console.log("First player - setting as admin");
					updatedLobbyInfo = {
						players: [newPlayer],
						adminId: playerId,
						settings: {
							maxPlayers: 8,
							isPrivate: false,
							mutedPlayers: [],
						},
					};
					isNewPlayer = true;
				} else {
					console.log("Existing lobby with players");
					const existingPlayers = lobbyData.lobby_info.players as Player[];
					const playerExists = existingPlayers.some(p => p.id === playerId);

					if (!playerExists) {
						updatedLobbyInfo = {
							...lobbyData.lobby_info,
							settings: {
								...lobbyData.lobby_info.settings,
								mutedPlayers: lobbyData.lobby_info.settings?.mutedPlayers || [],
							},
							players: [...existingPlayers, newPlayer],
						};
						isNewPlayer = true;
					} else {
						updatedLobbyInfo = {
							...lobbyData.lobby_info,
							settings: {
								...lobbyData.lobby_info.settings,
								mutedPlayers: lobbyData.lobby_info.settings?.mutedPlayers || [],
							},
							players: existingPlayers.map(p => (p.id === playerId ? { ...p, lastSeen: now } : p)),
						};
					}
				}

				const { data: updatedLobby, error: updateError } = await supabase.from("lobbies").update({ lobby_info: updatedLobbyInfo }).eq("id", lobbyData.id).select().single();

				if (updateError || !updatedLobby) {
					setError("Failed to join lobby");
					setLoading(false);
					return;
				}

				setLobby(updatedLobby);
				setCurrentPlayer(newPlayer);
				setGameType(updatedLobby.game_type || "");

				// Send system message for new player
				if (isNewPlayer) {
					await supabase.from("lobby_messages").insert({
						lobby_id: updatedLobby.id,
						player_id: null,
						player_name: null,
						message: `${playerName} joined the lobby`,
						is_system: true,
					});
				}

				// Fetch messages (last 200)
				const { data: messagesData } = await supabase.from("lobby_messages").select("*").eq("lobby_id", updatedLobby.id).order("created_at", { ascending: true }).limit(200);

				if (messagesData) {
					setMessages(messagesData);
				}

				setLoading(false);

				// Setup realtime subscription for lobby
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

				// Setup realtime subscription for messages
				const msgChannel = supabase
					.channel(`lobby_messages:${lobbyData.id}`)
					.on(
						"postgres_changes",
						{
							event: "INSERT",
							schema: "public",
							table: "lobby_messages",
							filter: `lobby_id=eq.${lobbyData.id}`,
						},
						payload => {
							setMessages(prev => {
								const newMessages = [...prev, payload.new as Message];
								// Keep only last 200 messages
								if (newMessages.length > 200) {
									return newMessages.slice(-200);
								}
								return newMessages;
							});
						}
					)
					.subscribe();

				setMessagesChannel(msgChannel);
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
			if (messagesChannel) {
				messagesChannel.unsubscribe();
			}
		};
	}, [lobbyCode]);

	const isAdmin = currentPlayer?.id === lobby?.lobby_info?.adminId;
	const isMuted = lobby?.lobby_info?.settings?.mutedPlayers?.includes(currentPlayer?.id || "") || false;

	const handleGameTypeChange = async (newGameType: string) => {
		if (!isAdmin || !lobby) return;

		const { error } = await supabase.from("lobbies").update({ game_type: newGameType }).eq("id", lobby.id);

		if (error) {
			console.error("Failed to update game type:", error);
		} else {
			await sendSystemMessage(`Game type set to: ${newGameType.replace("_", " ")}`);
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

	const handleToggleMute = async (playerId: string, playerName: string) => {
		if (!isAdmin || !lobby) return;

		const mutedPlayers = lobby.lobby_info.settings.mutedPlayers || [];
		const isMuted = mutedPlayers.includes(playerId);

		const updatedMutedPlayers = isMuted ? mutedPlayers.filter(id => id !== playerId) : [...mutedPlayers, playerId];

		const updatedInfo = {
			...lobby.lobby_info,
			settings: {
				...lobby.lobby_info.settings,
				mutedPlayers: updatedMutedPlayers,
			},
		};

		const { error } = await supabase.from("lobbies").update({ lobby_info: updatedInfo }).eq("id", lobby.id);

		if (error) {
			console.error("Failed to toggle mute:", error);
		} else {
			await sendSystemMessage(`${playerName} has been ${isMuted ? "unmuted" : "muted"}`);
		}
	};

	const handleSendMessage = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!messageInput.trim() || !lobby || !currentPlayer || isMuted) return;

		const trimmedMessage = messageInput.trim().slice(0, 200);

		const { error } = await supabase.from("lobby_messages").insert({
			lobby_id: lobby.id,
			player_id: currentPlayer.id,
			player_name: currentPlayer.name,
			message: trimmedMessage,
			is_system: false,
		});

		if (error) {
			console.error("Failed to send message:", error);
		} else {
			setMessageInput("");
		}
	};

	const handleLeaveLobby = async () => {
		if (!lobby || !currentPlayer) return;

		const updatedPlayers = lobby.lobby_info.players.filter(p => p.id !== currentPlayer.id);

		// Send system message
		await sendSystemMessage(`${currentPlayer.name} left the lobby`);

		if (updatedPlayers.length === 0) {
			await supabase.from("lobbies").delete().eq("id", lobby.id);
		} else {
			let updatedInfo = { ...lobby.lobby_info, players: updatedPlayers };

			if (isAdmin) {
				updatedInfo.adminId = updatedPlayers[0].id;
				await sendSystemMessage(`${updatedPlayers[0].name} is now the admin`);
			}

			await supabase.from("lobbies").update({ lobby_info: updatedInfo }).eq("id", lobby.id);
		}

		router.push("/");
	};

	const formatTime = (timestamp: string) => {
		const date = new Date(timestamp);
		return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

				<div className="lobby-grid-with-chat">
					{/* Left: Chat */}
					<div className="card chat-card">
						<h2 className="card-title">Chat</h2>
						<div className="chat-messages">
							{messages.map(msg => (
								<div key={msg.id} className={`chat-message ${msg.is_system ? "chat-message-system" : ""}`}>
									{msg.is_system ? (
										<div className="chat-message-content">
											<span className="chat-system-text">{msg.message}</span>
											<span className="chat-time">{formatTime(msg.created_at)}</span>
										</div>
									) : (
										<div className="chat-message-content">
											<div className="chat-message-header">
												<span className="chat-player-name">{msg.player_name}</span>
												<span className="chat-time">{formatTime(msg.created_at)}</span>
											</div>
											<div className="chat-message-text">{msg.message}</div>
										</div>
									)}
								</div>
							))}
							<div ref={messagesEndRef} />
						</div>
						<form onSubmit={handleSendMessage} className="chat-input-form">
							<input type="text" value={messageInput} onChange={e => setMessageInput(e.target.value)} placeholder={isMuted ? "You are muted" : "Type a message..."} disabled={isMuted} maxLength={200} className="chat-input" />
							<button type="submit" disabled={!messageInput.trim() || isMuted} className="chat-send-button">
								Send
							</button>
						</form>
						{isMuted && <p className="muted-warning">You have been muted by the admin</p>}
					</div>

					{/* Middle: Player List */}
					<div className="card">
						<h2 className="card-title">Players</h2>
						<div className="player-list">
							{lobby.lobby_info.players.map(player => {
								const playerMuted = lobby.lobby_info.settings.mutedPlayers?.includes(player.id);
								return (
									<div key={player.id} className={`player-card ${player.id === currentPlayer?.id ? "player-card-current" : ""}`}>
										<div className="player-info">
											<span className="player-name">{player.name}</span>
											{player.id === lobby.lobby_info.adminId && <span className="admin-badge">ADMIN</span>}
											{playerMuted && <span className="muted-badge">MUTED</span>}
										</div>
										{isAdmin && player.id !== currentPlayer?.id && (
											<button onClick={() => handleToggleMute(player.id, player.name)} className="mute-button">
												{playerMuted ? "Unmute" : "Mute"}
											</button>
										)}
									</div>
								);
							})}
						</div>
					</div>

					{/* Right: Game Settings */}
					<div className="card">
						<h2 className="card-title">Game Settings</h2>

						{isAdmin ? (
							<div className="settings-container">
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

								<div className="form-group">
									<label className="form-label">Max Players: {lobby.lobby_info.settings.maxPlayers}</label>
									<input type="range" min="2" max="16" value={lobby.lobby_info.settings.maxPlayers} onChange={e => handleMaxPlayersChange(parseInt(e.target.value))} className="form-range" />
								</div>

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
