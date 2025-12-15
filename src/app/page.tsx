"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Lobby = {
	id: number;
	code: string;
	game_type: string | null;
	settings: {
		maxPlayers: number;
		isPrivate: boolean;
		mutedPlayers: string[];
	};
	created_at: string;
};

type LobbyWithCount = Lobby & {
	player_count: number;
};

export default function Home() {
	const router = useRouter();

	const [creating, setCreating] = useState(false);
	const [joinCode, setJoinCode] = useState("");
	const [username, setUsername] = useState("");
	const [editingName, setEditingName] = useState(false);
	const [lobbies, setLobbies] = useState<LobbyWithCount[]>([]);

	useEffect(() => {
		const existing = localStorage.getItem("playerName");
		if (existing) setUsername(existing);
	}, []);

	useEffect(() => {
		const loadLobbies = async () => {
			const { data: lobbyData, error } = await supabase.from("lobbies").select("*").order("created_at", { ascending: false });

			if (error || !lobbyData) return;

			const typedLobbies = lobbyData as Lobby[];

			const { data: players } = await supabase.from("lobby_players").select("lobby_id");

			const typedPlayers = players as { lobby_id: number }[] | null;

			const countMap = new Map<number, number>();

			typedPlayers?.forEach(p => {
				countMap.set(p.lobby_id, (countMap.get(p.lobby_id) || 0) + 1);
			});

			setLobbies(
				typedLobbies.map(lobby => ({
					...lobby,
					settings: lobby.settings ?? {
						maxPlayers: 8,
						isPrivate: false,
						mutedPlayers: [],
					},
					player_count: countMap.get(lobby.id) || 0,
				}))
			);
		};

		loadLobbies();

		const channel = supabase.channel("lobby-updates").on("postgres_changes", { event: "*", schema: "public", table: "lobbies" }, loadLobbies).on("postgres_changes", { event: "*", schema: "public", table: "lobby_players" }, loadLobbies).subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	}, []);

	const joinLobby = () => {
		const code = joinCode.trim().toUpperCase();
		if (!code) return;
		router.push(`/lobby/${code}`);
	};

	const createLobby = async () => {
		setCreating(true);

		const code = Math.random().toString(36).slice(2, 8).toUpperCase();

		// @ts-expect-error - Supabase type inference issue with Database generic
		const { error } = await supabase.from("lobbies").insert({
			code,
			game_type: null,
			settings: {
				maxPlayers: 8,
				isPrivate: false,
				mutedPlayers: [],
			},
		});

		if (!error) router.push(`/lobby/${code}`);

		setCreating(false);
	};

	return (
		<div className="min-h-screen bg-gray-900 text-white p-8">
			<div className="flex justify-between items-center mb-8">
				<h1 className="text-4xl font-bold">Chizza Game Hub</h1>

				<div className="flex items-center gap-3">
					{editingName ? (
						<>
							<input value={username} maxLength={16} onChange={e => setUsername(e.target.value)} className="px-3 py-2 rounded bg-gray-800 border border-gray-700" />
							<button
								onClick={() => {
									const trimmed = username.trim();
									if (trimmed.length < 3) return;
									localStorage.setItem("playerName", trimmed);
									setUsername(trimmed);
									setEditingName(false);
								}}
								className="px-3 py-2 bg-blue-600 rounded"
							>
								Save
							</button>
						</>
					) : (
						<>
							<span className="text-gray-300">👤 {username || "Guest"}</span>
							<button onClick={() => setEditingName(true)} className="text-blue-400 text-sm">
								✏️ Edit
							</button>
						</>
					)}
				</div>
			</div>

			<div className="mb-8">
				<button onClick={createLobby} disabled={creating} className="px-6 py-3 bg-green-600 rounded-lg font-bold" style={{ width: 280 }}>
					{creating ? "Creating Lobby..." : "🎲 Create Lobby"}
				</button>
			</div>

			<div className="mb-12">
				<input value={joinCode} maxLength={6} onChange={e => setJoinCode(e.target.value)} placeholder="ABC123" className="px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 uppercase" />
				<button onClick={joinLobby} className="ml-4 px-6 py-3 bg-blue-600 rounded-lg">
					🚪 Join Lobby
				</button>
			</div>

			<div className="mb-16 max-w-4xl">
				<h2 className="text-2xl font-bold mb-4">Public Lobbies</h2>

				{lobbies.filter(l => l.player_count > 0 && !l.settings?.isPrivate).length === 0 && <p className="text-gray-400">No lobbies available</p>}

				{lobbies
					.filter(l => l.player_count > 0 && !l.settings?.isPrivate)
					.map(lobby => (
						<div key={lobby.code} className="flex justify-between p-4 bg-gray-800 rounded-lg mb-3">
							<div>
								<div className="font-mono text-lg">{lobby.code}</div>
								<div className="text-sm text-gray-400">
									{lobby.game_type ?? "Not started"} • {lobby.player_count} / {lobby.settings!.maxPlayers}
								</div>
							</div>

							<button disabled={lobby.player_count >= lobby.settings!.maxPlayers} onClick={() => router.push(`/lobby/${lobby.code}`)} className="px-4 py-2 bg-blue-600 rounded disabled:bg-gray-600">
								{lobby.player_count >= lobby.settings!.maxPlayers ? "Full" : "Join"}
							</button>
						</div>
					))}
			</div>

			<h2 className="text-2xl font-bold mb-4">Quick Play Games</h2>
			<div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl">
				<Link href="/games/tictactoe" className="p-6 bg-gray-800 rounded-lg">
					🎮 Tic Tac Toe
				</Link>
			</div>
		</div>
	);
}
