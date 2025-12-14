"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function Home() {
	const router = useRouter();
	const [creating, setCreating] = useState(false);

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
