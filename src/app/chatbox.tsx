import { useState, useRef, useEffect, FormEvent } from "react";

type Message = {
	id: string;
	lobby_id: number;
	player_id: string | null;
	player_name: string | null;
	message: string;
	is_system: boolean;
	created_at: string;
};

type Player = {
	player_id: string;
	name: string;
	is_muted: boolean;
	is_admin: boolean;
};

type ChatBoxProps = {
	messages: Message[];
	players: Player[];
	currentPlayerId: string | null;
	isChatFocused: boolean;
	messageInput: string;
	isMuted: boolean;
	isAdmin: boolean;
	onChatFocusChange: (focused: boolean) => void;
	onMessageInputChange: (value: string) => void;
	onSendMessage: (e: FormEvent) => void;
	onToggleMute: (playerId: string, playerName: string) => void;
	onKickPlayer: (playerId: string, playerName: string) => void;
};

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function ChatBox({ messages, players, currentPlayerId, isChatFocused, messageInput, isMuted, isAdmin, onChatFocusChange, onMessageInputChange, onSendMessage, onToggleMute, onKickPlayer }: ChatBoxProps) {
	const [activeTab, setActiveTab] = useState<"chat" | "players" | "leaderboard" | "minimised">("chat");
	const chatInputRef = useRef<HTMLInputElement | null>(null);
	const messagesEndRef = useRef<HTMLDivElement | null>(null);

	const scrollToBottom = () => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	};

	useEffect(scrollToBottom, [messages]);

	const handleContainerClick = () => {
		if (!isChatFocused) {
			onChatFocusChange(true);
			setTimeout(() => chatInputRef.current?.focus(), 100);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Escape") {
			e.preventDefault();
			onChatFocusChange(false);
			onMessageInputChange("");
		}
	};

	return (
		<div
			style={{
				position: "absolute",
				bottom: "20px",
				left: "20px",
				width: "400px",
				maxHeight: "500px",
				background: "rgba(0, 0, 0, 0.85)",
				borderRadius: "8px",
				padding: "15px",
				display: "flex",
				flexDirection: "column",
				fontFamily: "Arial, sans-serif",
				border: isChatFocused ? "2px solid #4ECDC4" : "2px solid transparent",
			}}
			onClick={handleContainerClick}
		>
			{/* Header with Tabs */}
			<div
				style={{
					display: "flex",
					justifyContent: "center",
					alignItems: "center",
					borderBottom: activeTab !== "minimised" ? "1px solid rgba(255,255,255,0.2)" : "none",
					paddingBottom: activeTab !== "minimised" ? "8px" : "0px",
				}}
			>
				<div style={{ display: "flex" }}>
					<button
						onClick={e => {
							e.stopPropagation();
							setActiveTab("chat");
						}}
						style={{
							padding: "6px 12px",
							borderRadius: "4px",
							border: "none",
							background: activeTab === "chat" ? "#4ECDC4" : "rgba(255,255,255,0.1)",
							color: "white",
							cursor: "pointer",
							fontSize: "13px",
							fontWeight: activeTab === "chat" ? "bold" : "normal",
							margin: "0 6px 0 0",
						}}
					>
						Chat
					</button>
					<button
						onClick={e => {
							e.stopPropagation();
							setActiveTab("players");
						}}
						style={{
							padding: "6px 12px",
							borderRadius: "4px",
							border: "none",
							background: activeTab === "players" ? "#4ECDC4" : "rgba(255,255,255,0.1)",
							color: "white",
							cursor: "pointer",
							fontSize: "13px",
							fontWeight: activeTab === "players" ? "bold" : "normal",
							margin: "0 6px 0 0",
						}}
					>
						Players ({players.length})
					</button>
					<button
						onClick={e => {
							e.stopPropagation();
							setActiveTab("leaderboard");
						}}
						style={{
							padding: "6px 12px",
							borderRadius: "4px",
							border: "none",
							background: activeTab === "leaderboard" ? "#4ECDC4" : "rgba(255,255,255,0.1)",
							color: "white",
							cursor: "pointer",
							fontSize: "13px",
							fontWeight: activeTab === "leaderboard" ? "bold" : "normal",
							margin: "0 6px 0 0",
						}}
					>
						Leaderboard
					</button>
					<button
						onClick={e => {
							e.stopPropagation();
							setActiveTab("minimised");
						}}
						style={{
							padding: "6px 12px",
							borderRadius: "4px",
							border: "none",
							background: activeTab === "minimised" ? "#4ECDC4" : "rgba(255,255,255,0.1)",
							color: "white",
							cursor: "pointer",
							fontSize: "13px",
							fontWeight: activeTab === "minimised" ? "bold" : "normal",
						}}
					>
						Minimise
					</button>
				</div>
			</div>

			{/* Content Area */}
			<div
				style={{
					flex: 1,
					overflowY: "auto",
					display: "flex",
					flexDirection: "column",
					gap: "8px",
					maxHeight: "280px",
					padding: activeTab !== "minimised" ? "8px 0" : "0",
				}}
			>
				{activeTab === "chat" && (
					<>
						{messages.map(msg => {
							if (msg.is_system && msg.message.startsWith("KICKED:")) {
								return null;
							}

							const msgPlayer = players.find(p => p.player_id === msg.player_id);

							return (
								<div
									key={msg.id}
									style={{
										padding: "6px 10px",
										borderRadius: "4px",
										background: msg.is_system ? "rgba(100, 100, 255, 0.2)" : "rgba(255, 255, 255, 0.1)",
										position: "relative",
									}}
								>
									{msg.is_system ? (
										<div style={{ fontSize: "12px", color: "#aaf", fontStyle: "italic" }}>
											{msg.message}
											<span style={{ marginLeft: "8px", opacity: 0.6, fontSize: "10px" }}>{formatTime(msg.created_at)}</span>
										</div>
									) : (
										<div>
											<div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", alignItems: "center" }}>
												<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
													<span style={{ color: "#4ECDC4", fontWeight: "bold", fontSize: "13px" }}>{msg.player_name}</span>
													{msgPlayer?.is_muted && <span style={{ fontSize: "10px", background: "#dc2626", padding: "2px 6px", borderRadius: "3px", color: "white" }}>MUTED</span>}
												</div>
												<span style={{ color: "#999", fontSize: "10px" }}>{formatTime(msg.created_at)}</span>
											</div>
											<div style={{ color: "white", fontSize: "13px", wordBreak: "break-word" }}>{msg.message}</div>
										</div>
									)}
								</div>
							);
						})}
						<div ref={messagesEndRef} />
					</>
				)}

				{activeTab === "players" && (
					<div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
						{players.map(player => (
							<div
								key={player.player_id}
								style={{
									padding: "10px",
									borderRadius: "4px",
									background: player.player_id === currentPlayerId ? "rgba(78, 205, 196, 0.2)" : "rgba(255, 255, 255, 0.1)",
									display: "flex",
									justifyContent: "space-between",
									alignItems: "center",
								}}
							>
								<div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
									<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
										<span style={{ color: "white", fontWeight: "bold", fontSize: "14px" }}>{player.name}</span>
										{player.player_id === currentPlayerId && <span style={{ fontSize: "10px", background: "#4ECDC4", padding: "2px 6px", borderRadius: "3px", color: "black", fontWeight: "bold" }}>YOU</span>}
										{player.is_admin && <span style={{ fontSize: "10px", background: "#f59e0b", padding: "2px 6px", borderRadius: "3px", color: "white", fontWeight: "bold" }}>ADMIN</span>}
										{player.is_muted && <span style={{ fontSize: "10px", background: "#dc2626", padding: "2px 6px", borderRadius: "3px", color: "white" }}>MUTED</span>}
									</div>
								</div>

								{isAdmin && player.player_id !== currentPlayerId && (
									<div style={{ display: "flex", gap: "6px" }}>
										<button
											onClick={e => {
												e.stopPropagation();
												onToggleMute(player.player_id, player.name);
											}}
											style={{
												padding: "4px 10px",
												fontSize: "11px",
												borderRadius: "3px",
												border: "none",
												background: player.is_muted ? "#10b981" : "#f59e0b",
												color: "white",
												cursor: "pointer",
												fontWeight: "bold",
											}}
										>
											{player.is_muted ? "Unmute" : "Mute"}
										</button>
										<button
											onClick={e => {
												e.stopPropagation();
												onKickPlayer(player.player_id, player.name);
											}}
											style={{
												padding: "4px 10px",
												fontSize: "11px",
												borderRadius: "3px",
												border: "none",
												background: "#dc2626",
												color: "white",
												cursor: "pointer",
												fontWeight: "bold",
											}}
										>
											Kick
										</button>
									</div>
								)}
							</div>
						))}
					</div>
				)}

				{activeTab === "leaderboard" && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#999", fontSize: "14px", fontStyle: "italic" }}>No leaderboard data available for this game mode</div>}
			</div>

			{/* Chat Input (only shown on chat tab) */}
			{activeTab === "chat" && (
				<form onSubmit={onSendMessage} style={{ display: "flex", gap: "8px" }}>
					<input
						ref={chatInputRef}
						type="text"
						value={messageInput}
						onChange={e => onMessageInputChange(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder={isMuted ? "You are muted" : "Type a message..."}
						disabled={isMuted}
						maxLength={200}
						style={{
							flex: 1,
							padding: "8px 12px",
							borderRadius: "4px",
							border: "1px solid rgba(255,255,255,0.3)",
							background: "rgba(255,255,255,0.1)",
							color: "white",
							fontSize: "13px",
						}}
					/>
					<button
						type="submit"
						disabled={!messageInput.trim() || isMuted}
						style={{
							padding: "8px 16px",
							borderRadius: "4px",
							border: "none",
							background: !messageInput.trim() || isMuted ? "#555" : "#4ECDC4",
							color: "white",
							cursor: !messageInput.trim() || isMuted ? "not-allowed" : "pointer",
							fontSize: "13px",
							fontWeight: "bold",
						}}
					>
						Send
					</button>
				</form>
			)}

			{isMuted && activeTab === "chat" && <p style={{ margin: 0, color: "#ff6b6b", fontSize: "12px", textAlign: "center" }}>You have been muted by the admin</p>}
		</div>
	);
}
