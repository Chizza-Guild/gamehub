"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-client";
import { RealtimeChannel } from "@supabase/supabase-js";
import "./styles.css";

type Player = {
	player_id: string;
	name: string;
	joined_at: string;
	last_seen: string;
	is_admin: boolean;
	is_muted: boolean;
};

type LobbySettings = {
	maxPlayers: number;
	isPrivate: boolean;
};

type Lobby = {
	id: number;
	code: string;
	game_type: string | null;
	settings: LobbySettings;
};

type Message = {
	id: string;
	lobby_id: number;
	player_id: string | null;
	player_name: string | null;
	message: string;
	is_system: boolean;
	created_at: string;
};

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function LobbyPage() {
	const { code } = useParams<{ code: string }>();
	const router = useRouter();
	const supabase = createClient();

	const [lobby, setLobby] = useState<Lobby | null>(null);
	const [players, setPlayers] = useState<Player[]>([]);
	const [messages, setMessages] = useState<Message[]>([]);
	const [messageInput, setMessageInput] = useState("");
	const [gameType, setGameType] = useState("");
	const [maxPlayers, setMaxPlayers] = useState(8);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
	const [currentPlayerName, setCurrentPlayerName] = useState<string | null>(null);

	const lobbyChannel = useRef<RealtimeChannel | null>(null);
	const messagesChannel = useRef<RealtimeChannel | null>(null);
	const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
	const cleanupRef = useRef<NodeJS.Timeout | null>(null);
	const messagesEndRef = useRef<HTMLDivElement | null>(null);
	const maxPlayersDebounceRef = useRef<NodeJS.Timeout | null>(null);

	const scrollToBottom = () => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	};

	useEffect(scrollToBottom, [messages]);

	const sendSystemMessage = async (text: string) => {
		if (!lobby) return;

		await supabase.from("lobby_messages").insert({
			lobby_id: lobby.id,
			message: text,
			is_system: true,
		});
	};

	const handleMaxPlayersChange = (value: number) => {
		setMaxPlayers(value);

		// Clear existing timeout
		if (maxPlayersDebounceRef.current) {
			clearTimeout(maxPlayersDebounceRef.current);
		}

		// Set new timeout to update database
		maxPlayersDebounceRef.current = setTimeout(async () => {
			if (!lobby) return;

			await supabase
				.from("lobbies")
				.update({
					settings: {
						...lobby.settings,
						maxPlayers: value,
					},
				})
				.eq("id", lobby.id);

			// Update local state
			setLobby(prev => {
				if (!prev) return prev;
				return {
					...prev,
					settings: {
						...prev.settings,
						maxPlayers: value,
					},
				};
			});
		}, 500); // 500ms debounce
	};

	useEffect(() => {
		if (!code) return;

		const init = async () => {
			let playerId = localStorage.getItem("playerId");
			let playerName = localStorage.getItem("playerName");

			if (!playerId) {
				playerId = window.crypto.randomUUID();
				localStorage.setItem("playerId", playerId);
			}

			if (!playerName) {
				playerName = `Player${Math.floor(Math.random() * 1000)}`;
				localStorage.setItem("playerName", playerName);
			}

			setCurrentPlayerId(playerId);
			setCurrentPlayerName(playerName);

			const { data: lobbyData } = await supabase.from("lobbies").select("*").eq("code", code).single();

			if (!lobbyData) {
				setError("Lobby not found");
				setLoading(false);
				return;
			}

			setLobby(lobbyData);
			setGameType(lobbyData.game_type || "");
			setMaxPlayers(lobbyData.settings?.maxPlayers || 8);

			await supabase.from("lobby_players").upsert({
				lobby_id: lobbyData.id,
				player_id: playerId,
				name: playerName,
				last_seen: new Date().toISOString(),
			});

			const { data: existingAdmin } = await supabase.from("lobby_players").select("player_id").eq("lobby_id", lobbyData.id).eq("is_admin", true).maybeSingle();

			if (!existingAdmin) {
				await supabase.from("lobby_players").update({ is_admin: true }).eq("lobby_id", lobbyData.id).eq("player_id", playerId);
			}

			const { data: playersData } = await supabase.from("lobby_players").select("*").eq("lobby_id", lobbyData.id).order("joined_at");

			setPlayers(playersData || []);

			const { data: messagesData } = await supabase.from("lobby_messages").select("*").eq("lobby_id", lobbyData.id).order("created_at");

			setMessages(messagesData || []);

			// Set up channels FIRST
			lobbyChannel.current = supabase
				.channel(`lobby:${lobbyData.id}`)
				.on(
					"postgres_changes",
					{
						event: "*",
						schema: "public",
						table: "lobby_players",
						filter: `lobby_id=eq.${lobbyData.id}`,
					},
					async () => {
						const { data } = await supabase.from("lobby_players").select("*").eq("lobby_id", lobbyData.id).order("joined_at");

						setPlayers(data || []);
					}
				)
				.subscribe();

			// Set up messages channel and wait for it to be subscribed
			messagesChannel.current = supabase
				.channel(`messages:${lobbyData.id}`)
				.on(
					"postgres_changes",
					{
						event: "INSERT",
						schema: "public",
						table: "lobby_messages",
						filter: `lobby_id=eq.${lobbyData.id}`,
					},
					payload => {
						const newMessage = payload.new as Message;
						setMessages(prev => [...prev, newMessage].slice(-200));

						// Check if this is a game start message
						if (newMessage.is_system && newMessage.message.startsWith("GAME_START:")) {
							const gameType = newMessage.message.replace("GAME_START:", "");
							router.push(`/games/${gameType}/${code}`);
						}
					}
				)
				.subscribe(async status => {
					// Only send join message when channel is successfully subscribed
					if (status === "SUBSCRIBED") {
						await supabase.from("lobby_messages").insert({
							lobby_id: lobbyData.id,
							message: `${playerName} joined the lobby`,
							is_system: true,
						});
					}
				});

			setLoading(false);
		};

		init();

		return () => {
			lobbyChannel.current?.unsubscribe();
			messagesChannel.current?.unsubscribe();
			if (maxPlayersDebounceRef.current) {
				clearTimeout(maxPlayersDebounceRef.current);
			}
		};
	}, [code]);

	useEffect(() => {
		if (!lobby || !currentPlayerId) return;

		heartbeatRef.current = setInterval(async () => {
			await supabase.from("lobby_players").update({ last_seen: new Date().toISOString() }).eq("lobby_id", lobby.id).eq("player_id", currentPlayerId);
		}, 10000);

		cleanupRef.current = setInterval(async () => {
			const cutoff = new Date(Date.now() - 30000).toISOString();

			const { data: removed } = await supabase.from("lobby_players").delete().lt("last_seen", cutoff).eq("lobby_id", lobby.id).select();

			if (removed) {
				for (const p of removed) {
					await sendSystemMessage(`${p.name} disconnected`);
				}
			}

			const { data: remaining } = await supabase.from("lobby_players").select("*").eq("lobby_id", lobby.id).order("joined_at");

			if (!remaining || remaining.length === 0) {
				await supabase.from("lobbies").delete().eq("id", lobby.id);
				router.push("/");
				return;
			}

			if (!remaining.some(p => p.is_admin)) {
				await supabase.from("lobby_players").update({ is_admin: true }).eq("lobby_id", lobby.id).eq("player_id", remaining[0].player_id);

				await sendSystemMessage(`${remaining[0].name} is now the admin`);
			}
		}, 15000);

		return () => {
			if (heartbeatRef.current) clearInterval(heartbeatRef.current);
			if (cleanupRef.current) clearInterval(cleanupRef.current);
		};
	}, [lobby, currentPlayerId]);

	const currentPlayer = players.find(p => p.player_id === currentPlayerId);
	const isAdmin = currentPlayer?.is_admin || false;
	const isMuted = currentPlayer?.is_muted || false;

	const handleSendMessage = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!messageInput.trim() || !lobby || isMuted) return;

		await supabase.from("lobby_messages").insert({
			lobby_id: lobby.id,
			player_id: currentPlayerId,
			player_name: currentPlayerName,
			message: messageInput.trim(),
			is_system: false,
		});

		setMessageInput("");
	};

	const handleToggleMute = async (playerId: string, name: string) => {
		if (!lobby || !isAdmin) return;

		const target = players.find(p => p.player_id === playerId);
		if (!target) return;

		await supabase.from("lobby_players").update({ is_muted: !target.is_muted }).eq("lobby_id", lobby.id).eq("player_id", playerId);

		await sendSystemMessage(`${name} ${target.is_muted ? "unmuted by admin" : "muted by admin"}`);
	};

	const handleLeaveLobby = async () => {
		if (!lobby || !currentPlayerId) return;

		await supabase.from("lobby_players").delete().eq("lobby_id", lobby.id).eq("player_id", currentPlayerId);

		await sendSystemMessage(`${currentPlayerName} left the lobby`);
		router.push("/");
	};

	const handleStartGame = async () => {
		if (!lobby || !gameType || !isAdmin) return;

		// Create a game start message in the database that all clients will see
		await supabase.from("lobby_messages").insert({
			lobby_id: lobby.id,
			message: `GAME_START:${gameType}`,
			is_system: true,
		});

		// Update lobby with selected game type
		await supabase.from("lobbies").update({ game_type: gameType }).eq("id", lobby.id);

		// Navigate admin to the game page
		router.push(`/games/${gameType}/${code}`);
	};

	if (loading) return <div className="lobby-container">Loading…</div>;
	if (error || !lobby) return <div className="lobby-container">{error}</div>;

	return (
		<div className="lobby-container">
			<div className="lobby-content">
				<div className="lobby-header">
					<h1 className="lobby-title">Lobby: {lobby.code}</h1>
					<p className="player-count">
						{players.length}/{lobby.settings.maxPlayers} players
					</p>
				</div>

				<div className="lobby-grid-with-chat">
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

						<div className="chat-input-form">
							<input type="text" value={messageInput} onChange={e => setMessageInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSendMessage(e)} placeholder={isMuted ? "You are muted" : "Type a message..."} disabled={isMuted} maxLength={200} className="chat-input" />
							<button onClick={handleSendMessage} disabled={!messageInput.trim() || isMuted} className="chat-send-button">
								Send
							</button>
						</div>

						{isMuted && <p className="muted-warning">You have been muted by the admin</p>}
					</div>

					<div className="card">
						<h2 className="card-title">Players</h2>

						<div className="player-list">
							{players.map(player => {
								const isCurrent = player.player_id === currentPlayerId;

								return (
									<div key={player.player_id} className={`player-card ${isCurrent ? "player-card-current" : ""}`}>
										<div className="player-info">
											<span className="player-name">{player.name}</span>
											{player.is_admin && <span className="admin-badge">ADMIN</span>}
											{player.is_muted && <span className="muted-badge">MUTED</span>}
										</div>

										{isAdmin && !isCurrent && (
											<button onClick={() => handleToggleMute(player.player_id, player.name)} className="mute-button">
												{player.is_muted ? "Unmute" : "Mute"}
											</button>
										)}
									</div>
								);
							})}
						</div>
					</div>

					<div className="card">
						<h2 className="card-title">Game Settings</h2>

						{isAdmin ? (
							<div className="settings-container">
								<div className="form-group">
									<label className="form-label">Game Type</label>
									<select value={gameType} onChange={e => setGameType(e.target.value)} className="form-select">
										<option value="">Select a game...</option>
										<option value="dance">Dance</option>
										<option value="tictactoe">Tic Tac Toe</option>
										<option value="maze">Maze</option>
									</select>
								</div>

								<div className="form-group">
									<label className="form-label">Max Players: {maxPlayers}</label>
									<input type="range" min="2" max="16" value={maxPlayers} onChange={e => handleMaxPlayersChange(parseInt(e.target.value))} className="form-range" />
								</div>

								<button onClick={handleStartGame} disabled={!gameType || players.length < 2} className="button button-success button-full">
									Start Game
								</button>
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

				<div className="lobby-footer">
					<button onClick={handleLeaveLobby} className="button button-danger">
						Leave Lobby
					</button>
				</div>
			</div>
		</div>
	);
}
