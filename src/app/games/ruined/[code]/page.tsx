"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase-client";
import { prompts } from "./prompts";

type Player = {
	player_id: string;
	name: string;
	is_admin: boolean;
};

type RuinedEntry = {
	id: string;
	lobby_id: number;
	player_id: string;
	round_id: number;
	modified_prompt: string;
	acquired_points: number;
};

type GameState = {
	phase: "waiting" | "ruin" | "ruin_voting" | "unruin" | "unruin_voting" | "leaderboard" | "final";
	round: number;
	totalRounds: number;
	timeLeft: number;
	currentPrompt: string;
	pairPlayerId: string | null;
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

type LeaderboardEntry = {
	player_id: string;
	player_name: string;
	total_points: number;
};

export default function RuinedGame() {
	const { code } = useParams<{ code: string }>();
	const router = useRouter();
	const supabase = createClient();

	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [lobbyId, setLobbyId] = useState<number | null>(null);
	const [players, setPlayers] = useState<Player[]>([]);
	const [gameState, setGameState] = useState<GameState | null>(null);
	const [modifiedPrompt, setModifiedPrompt] = useState("");
	const [messages, setMessages] = useState<Message[]>([]);
	const [messageInput, setMessageInput] = useState("");
	const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
	const [votingPrompts, setVotingPrompts] = useState<RuinedEntry[]>([]);
	const [selectedVote, setSelectedVote] = useState<string | null>(null);
	const [hasVoted, setHasVoted] = useState(false);
	const [showLeaderboard, setShowLeaderboard] = useState(false);

	const currentPlayerIdRef = useRef<string | null>(null);
	const currentPlayerNameRef = useRef<string | null>(null);
	const channelRef = useRef<any>(null);
	const messagesChannelRef = useRef<any>(null);
	const timerRef = useRef<NodeJS.Timeout | null>(null);
	const usedPromptsRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		if (!code) {
			router.push("/");
			return;
		}

		const init = async () => {
			try {
				const playerId = localStorage.getItem("playerId");
				const playerName = localStorage.getItem("playerName");

				if (!playerId || !playerName) {
					setError("Player info not found");
					router.push("/");
					return;
				}

				currentPlayerIdRef.current = playerId;
				currentPlayerNameRef.current = playerName;

				const { data: lobbyData, error: lobbyError } = await supabase.from("lobbies").select("id, settings").eq("code", code).single();

				if (lobbyError || !lobbyData) {
					setError("Lobby not found");
					router.push("/");
					return;
				}

				setLobbyId(lobbyData.id);

				const { data: playersData } = await supabase.from("lobby_players").select("player_id, name, is_admin").eq("lobby_id", lobbyData.id);

				setPlayers(playersData || []);

				const { data: messagesData } = await supabase.from("lobby_messages").select("*").eq("lobby_id", lobbyData.id).order("created_at");

				setMessages(messagesData || []);

				const { data: playerData } = await supabase.from("lobby_players").select("is_admin").eq("lobby_id", lobbyData.id).eq("player_id", playerId).single();

				const isAdmin = playerData?.is_admin || false;

				if (isAdmin) {
					await initializeGame(lobbyData.id, playersData || []);
				}

				messagesChannelRef.current = supabase
					.channel(`ruined-messages:${lobbyData.id}`)
					.on(
						"postgres_changes",
						{
							event: "INSERT",
							schema: "public",
							table: "lobby_messages",
							filter: `lobby_id=eq.${lobbyData.id}`,
						},
						payload => {
							const message = payload.new as Message;
							setMessages(prev => [...prev, message].slice(-200));

							if (message.is_system && message.message.startsWith("GAME_STATE:")) {
								const stateData = JSON.parse(message.message.replace("GAME_STATE:", ""));
								setGameState(stateData);
								setHasVoted(false);
								setSelectedVote(null);
							}

							if (message.is_system && message.message.startsWith("VOTING_PROMPTS:")) {
								const promptsData = JSON.parse(message.message.replace("VOTING_PROMPTS:", ""));
								setVotingPrompts(promptsData);
							}

							if (message.is_system && message.message.startsWith("LEADERBOARD:")) {
								const leaderboardData = JSON.parse(message.message.replace("LEADERBOARD:", ""));
								setLeaderboard(leaderboardData);
							}

							if (message.is_system && message.message === "GAME_END") {
								setTimeout(() => router.push(`/lobby/${code}`), 15000);
							}
						}
					)
					.subscribe();

				channelRef.current = supabase
					.channel(`ruined-game:${lobbyData.id}`)
					.on(
						"postgres_changes",
						{
							event: "*",
							schema: "public",
							table: "ruined",
							filter: `lobby_id=eq.${lobbyData.id}`,
						},
						() => {
							fetchLeaderboard(lobbyData.id);
						}
					)
					.subscribe();

				setLoading(false);
			} catch (err) {
				console.error("Init error:", err);
				setError(err instanceof Error ? err.message : String(err));
			}
		};

		init();

		return () => {
			channelRef.current?.unsubscribe();
			messagesChannelRef.current?.unsubscribe();
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, [code, router]);

	const initializeGame = async (lobbyId: number, players: Player[]) => {
		const totalRounds = players.length;
		const firstPrompt = getRandomPrompt();

		const pairs = createPairs(players);

		for (const pair of pairs) {
			const prompt = getRandomPrompt();
			await supabase.from("ruined").insert({
				lobby_id: lobbyId,
				player_id: "SYSTEM",
				round_id: 1,
				modified_prompt: prompt,
				acquired_points: 0,
			});

			await supabase.from("lobby_messages").insert({
				lobby_id: lobbyId,
				message: `PAIR:${pair[0].player_id},${pair[1] ? pair[1].player_id : ""}`,
				is_system: true,
			});
		}

		const initialState: GameState = {
			phase: "ruin",
			round: 1,
			totalRounds,
			timeLeft: 30,
			currentPrompt: firstPrompt,
			pairPlayerId: null,
		};

		await supabase.from("lobby_messages").insert({
			lobby_id: lobbyId,
			message: `GAME_STATE:${JSON.stringify(initialState)}`,
			is_system: true,
		});

		startTimer(lobbyId, initialState);
	};

	const createPairs = (players: Player[]): Player[][] => {
		const shuffled = [...players].sort(() => Math.random() - 0.5);
		const pairs: Player[][] = [];

		for (let i = 0; i < shuffled.length; i += 2) {
			if (i + 1 < shuffled.length) {
				pairs.push([shuffled[i], shuffled[i + 1]]);
			} else {
				pairs.push([shuffled[i]]);
			}
		}

		return pairs;
	};

	const getRandomPrompt = (): string => {
		const availablePrompts = prompts.filter(p => !usedPromptsRef.current.has(p));
		if (availablePrompts.length === 0) {
			usedPromptsRef.current.clear();
			return prompts[Math.floor(Math.random() * prompts.length)];
		}
		const prompt = availablePrompts[Math.floor(Math.random() * availablePrompts.length)];
		usedPromptsRef.current.add(prompt);
		return prompt;
	};

	const startTimer = async (lobbyId: number, state: GameState) => {
		if (timerRef.current) clearTimeout(timerRef.current);

		if (state.timeLeft <= 0) {
			await handlePhaseTransition(lobbyId, state);
			return;
		}

		timerRef.current = setTimeout(async () => {
			const newState = { ...state, timeLeft: state.timeLeft - 1 };
			await supabase.from("lobby_messages").insert({
				lobby_id: lobbyId,
				message: `GAME_STATE:${JSON.stringify(newState)}`,
				is_system: true,
			});
			startTimer(lobbyId, newState);
		}, 1000);
	};

	const handlePhaseTransition = async (lobbyId: number, state: GameState) => {
		const currentPlayer = players.find(p => p.player_id === currentPlayerIdRef.current);
		if (!currentPlayer?.is_admin) return;

		let newState: GameState;

		switch (state.phase) {
			case "ruin":
				const { data: ruinedPrompts } = await supabase.from("ruined").select("*").eq("lobby_id", lobbyId).eq("round_id", state.round).neq("player_id", "SYSTEM");

				await supabase.from("lobby_messages").insert({
					lobby_id: lobbyId,
					message: `VOTING_PROMPTS:${JSON.stringify(ruinedPrompts || [])}`,
					is_system: true,
				});

				newState = {
					...state,
					phase: "ruin_voting",
					timeLeft: 20,
				};
				break;

			case "ruin_voting":
				await calculateVotingResults(lobbyId, state.round, "ruin");
				newState = {
					...state,
					phase: "unruin",
					timeLeft: 30,
				};
				break;

			case "unruin":
				const { data: unruinedPrompts } = await supabase.from("ruined").select("*").eq("lobby_id", lobbyId).eq("round_id", state.round).neq("player_id", "SYSTEM");

				await supabase.from("lobby_messages").insert({
					lobby_id: lobbyId,
					message: `VOTING_PROMPTS:${JSON.stringify(unruinedPrompts || [])}`,
					is_system: true,
				});

				newState = {
					...state,
					phase: "unruin_voting",
					timeLeft: 20,
				};
				break;

			case "unruin_voting":
				await calculateVotingResults(lobbyId, state.round, "unruin");
				await fetchLeaderboard(lobbyId);

				if (state.round >= state.totalRounds) {
					newState = {
						...state,
						phase: "final",
						timeLeft: 15,
					};
				} else {
					newState = {
						...state,
						phase: "leaderboard",
						timeLeft: 10,
					};
				}
				break;

			case "leaderboard":
				newState = {
					...state,
					phase: "ruin",
					round: state.round + 1,
					timeLeft: 30,
				};
				break;

			case "final":
				await supabase.from("lobby_messages").insert({
					lobby_id: lobbyId,
					message: "GAME_END",
					is_system: true,
				});
				return;

			default:
				return;
		}

		await supabase.from("lobby_messages").insert({
			lobby_id: lobbyId,
			message: `GAME_STATE:${JSON.stringify(newState)}`,
			is_system: true,
		});

		startTimer(lobbyId, newState);
	};

	const calculateVotingResults = async (lobbyId: number, round: number, type: string) => {
		const { data: votes } = await supabase.from("lobby_messages").select("message").eq("lobby_id", lobbyId).like("message", `VOTE:${round}:${type}:%`);

		const voteCounts: Record<string, number> = {};

		votes?.forEach(v => {
			const parts = v.message.split(":");
			const votedId = parts[3];
			voteCounts[votedId] = (voteCounts[votedId] || 0) + 1;
		});

		const entries = Object.entries(voteCounts);
		if (entries.length === 0) return;

		const maxVotes = Math.max(...entries.map(([_, count]) => count));
		const winners = entries.filter(([_, count]) => count === maxVotes);

		for (const [playerId, voteCount] of entries) {
			let points = voteCount * 3;

			if (winners.length === 1 && winners[0][0] === playerId) {
				points += 5;
			} else if (winners.length > 1 && winners.some(([id]) => id === playerId)) {
				points += 2;
			}

			const { data: existing } = await supabase.from("ruined").select("acquired_points").eq("lobby_id", lobbyId).eq("player_id", playerId).eq("round_id", round).single();

			if (existing) {
				await supabase
					.from("ruined")
					.update({ acquired_points: existing.acquired_points + points })
					.eq("lobby_id", lobbyId)
					.eq("player_id", playerId)
					.eq("round_id", round);
			}
		}
	};

	const fetchLeaderboard = async (lobbyId: number) => {
		const { data } = await supabase.from("ruined").select("player_id, acquired_points").eq("lobby_id", lobbyId).neq("player_id", "SYSTEM");

		if (!data) return;

		const totals: Record<string, number> = {};
		data.forEach(entry => {
			totals[entry.player_id] = (totals[entry.player_id] || 0) + entry.acquired_points;
		});

		const leaderboardData: LeaderboardEntry[] = Object.entries(totals)
			.map(([player_id, total_points]) => {
				const player = players.find(p => p.player_id === player_id);
				return {
					player_id,
					player_name: player?.name || "Unknown",
					total_points,
				};
			})
			.sort((a, b) => b.total_points - a.total_points);

		setLeaderboard(leaderboardData);

		await supabase.from("lobby_messages").insert({
			lobby_id: lobbyId!,
			message: `LEADERBOARD:${JSON.stringify(leaderboardData)}`,
			is_system: true,
		});
	};

	const handleSubmitPrompt = async () => {
		if (!lobbyId || !gameState || !modifiedPrompt.trim()) return;

		await supabase.from("ruined").insert({
			lobby_id: lobbyId,
			player_id: currentPlayerIdRef.current!,
			round_id: gameState.round,
			modified_prompt: modifiedPrompt.trim(),
			acquired_points: 0,
		});

		setModifiedPrompt("");
	};

	const handleVote = async (promptId: string) => {
		if (!lobbyId || !gameState || hasVoted) return;

		const votedPrompt = votingPrompts.find(p => p.id === promptId);
		if (votedPrompt?.player_id === currentPlayerIdRef.current) return;

		setSelectedVote(promptId);
		setHasVoted(true);

		const voteType = gameState.phase === "ruin_voting" ? "ruin" : "unruin";

		await supabase.from("lobby_messages").insert({
			lobby_id: lobbyId,
			message: `VOTE:${gameState.round}:${voteType}:${votedPrompt?.player_id}`,
			is_system: true,
		});
	};

	const handleSendMessage = (e?: React.FormEvent) => {
		e?.preventDefault();
		if (!messageInput.trim() || !lobbyId) return;

		supabase.from("lobby_messages").insert({
			lobby_id: lobbyId,
			player_id: currentPlayerIdRef.current,
			player_name: currentPlayerNameRef.current,
			message: messageInput.trim(),
			is_system: false,
		});

		setMessageInput("");
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			e.preventDefault();
			handleSendMessage();
		}
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
				<div className="text-2xl">Loading game...</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex items-center justify-center min-h-screen bg-gray-900 text-red-500">
				<div className="text-2xl">Error: {error}</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-linear-to-br from-purple-900 via-gray-900 to-indigo-900 text-white p-8">
			<div className="max-w-7xl mx-auto">
				<div className="flex justify-between items-center mb-8">
					<h1 className="text-4xl font-bold">Ruined & Unruined</h1>
					<button onClick={() => setShowLeaderboard(!showLeaderboard)} className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg transition">
						{showLeaderboard ? "Hide" : "Show"} Leaderboard
					</button>
				</div>

				{gameState && (
					<div className="bg-gray-800 rounded-lg p-6 mb-6">
						<div className="flex justify-between items-center mb-4">
							<div className="text-xl">
								Round {gameState.round} / {gameState.totalRounds}
							</div>
							<div className="text-2xl font-bold">
								{Math.floor(gameState.timeLeft / 60)}:{(gameState.timeLeft % 60).toString().padStart(2, "0")}
							</div>
						</div>

						<div className="text-center text-2xl font-semibold mb-4 capitalize">
							{gameState.phase === "ruin" && "Ruin the Prompt!"}
							{gameState.phase === "ruin_voting" && "Vote for the Best Ruined Prompt"}
							{gameState.phase === "unruin" && "Unruin the Prompt!"}
							{gameState.phase === "unruin_voting" && "Vote for the Best Unruined Prompt"}
							{gameState.phase === "leaderboard" && "Round Complete!"}
							{gameState.phase === "final" && "Game Over!"}
						</div>

						{(gameState.phase === "ruin" || gameState.phase === "unruin") && (
							<div className="space-y-4">
								<div className="bg-gray-700 p-4 rounded-lg">
									<p className="text-lg mb-2">Original Prompt:</p>
									<p className="text-xl font-semibold">{gameState.currentPrompt}</p>
								</div>

								<div>
									<textarea value={modifiedPrompt} onChange={e => setModifiedPrompt(e.target.value)} placeholder={`Add text to ${gameState.phase} the prompt...`} className="w-full p-4 bg-gray-700 rounded-lg text-white resize-none" rows={4} maxLength={200} />
								</div>

								<button onClick={handleSubmitPrompt} disabled={!modifiedPrompt.trim()} className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition text-lg font-semibold">
									Submit
								</button>
							</div>
						)}

						{(gameState.phase === "ruin_voting" || gameState.phase === "unruin_voting") && (
							<div className="space-y-4">
								<p className="text-center text-lg mb-4">{hasVoted ? "Vote submitted! Waiting for others..." : "Choose the best prompt:"}</p>

								{votingPrompts.map(prompt => {
									const isOwn = prompt.player_id === currentPlayerIdRef.current;
									const isSelected = selectedVote === prompt.id;

									return (
										<button key={prompt.id} onClick={() => handleVote(prompt.id)} disabled={isOwn || hasVoted} className={`w-full p-4 rounded-lg transition ${isOwn ? "bg-gray-600 cursor-not-allowed opacity-50" : isSelected ? "bg-green-600" : "bg-gray-700 hover:bg-gray-600"}`}>
											<p className="text-lg">{prompt.modified_prompt}</p>
											{isOwn && <p className="text-sm mt-2 text-gray-400">(Your prompt)</p>}
										</button>
									);
								})}
							</div>
						)}
					</div>
				)}

				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
					<div className="lg:col-span-2 bg-gray-800 rounded-lg p-6">
						<h2 className="text-2xl font-bold mb-4">Chat</h2>
						<div className="h-64 overflow-y-auto mb-4 space-y-2">
							{messages
								.filter(m => !m.is_system || (!m.message.startsWith("GAME_STATE:") && !m.message.startsWith("VOTING_PROMPTS:") && !m.message.startsWith("LEADERBOARD:") && !m.message.startsWith("PAIR:") && !m.message.startsWith("VOTE:")))
								.map(msg => (
									<div key={msg.id} className={`p-2 rounded ${msg.is_system ? "bg-blue-900" : "bg-gray-700"}`}>
										{msg.is_system ? (
											<p className="text-blue-300">{msg.message}</p>
										) : (
											<>
												<p className="font-semibold">{msg.player_name}</p>
												<p>{msg.message}</p>
											</>
										)}
									</div>
								))}
						</div>

						<div className="flex gap-2">
							<input type="text" value={messageInput} onChange={e => setMessageInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Type a message..." className="flex-1 px-4 py-2 bg-gray-700 rounded-lg text-white" maxLength={200} />
							<button onClick={() => handleSendMessage()} disabled={!messageInput.trim()} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition">
								Send
							</button>
						</div>
					</div>

					{showLeaderboard && (
						<div className="bg-gray-800 rounded-lg p-6">
							<h2 className="text-2xl font-bold mb-4">Leaderboard</h2>
							<div className="space-y-2">
								{leaderboard.map((entry, index) => (
									<div key={entry.player_id} className={`p-3 rounded-lg ${index === 0 ? "bg-yellow-600" : index === 1 ? "bg-gray-600" : index === 2 ? "bg-orange-800" : "bg-gray-700"}`}>
										<div className="flex justify-between items-center">
											<div className="flex items-center gap-3">
												<span className="text-2xl font-bold">{index + 1}</span>
												<span className="font-semibold">{entry.player_name}</span>
											</div>
											<span className="text-xl font-bold">{entry.total_points} pts</span>
										</div>
									</div>
								))}
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
