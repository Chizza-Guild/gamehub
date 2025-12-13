import Image from "next/image";
import Link from "next/link";
import { div } from "three/tsl";

export default function Home() {
	return (
		<div>
			Hello - 

            <button>Maze game: <Link href="/games/maze">Maze</Link></button>
		</div>
        
	);
}
