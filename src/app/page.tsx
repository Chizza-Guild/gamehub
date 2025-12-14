import Image from "next/image";
import Link from "next/link";
import { div } from "three/tsl";

export default function Home() {
	return (
		<div className="min-h-screen bg-gray-900 text-white p-8">
			<h1 className="text-4xl font-bold mb-8">Game Hub</h1>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl">
				<Link
					href="/games/maze"
					className="p-6 bg-gray-800 hover:bg-gray-700 rounded-lg border-2 border-gray-700 hover:border-blue-500 transition"
				>
					<h2 className="text-2xl font-bold mb-2">🎮 Maze</h2>
					<p className="text-gray-400">3D first-person maze game</p>
				</Link>

				<Link
					href="/games/dance"
					className="p-6 bg-gray-800 hover:bg-gray-700 rounded-lg border-2 border-gray-700 hover:border-blue-500 transition"
				>
					<h2 className="text-2xl font-bold mb-2">🎵 Dodo Re Mi</h2>
					<p className="text-gray-400">Multiplayer rhythm game (2-8 players)</p>
				</Link>
			</div>
		</div>
	);
}
