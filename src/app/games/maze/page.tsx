"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase-client";
import * as THREE from "three";

type PlayerPosition = {
	player_id: string;
	player_name: string;
	x: number;
	y: number;
	z: number;
	yaw: number;
	pitch: number;
	color: string;
};

function generateMaze(size: number) {
	const maze = Array.from({ length: size }, () => Array(size).fill("#"));

	function shuffle(arr: number[]) {
		for (let i = arr.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[arr[i], arr[j]] = [arr[j], arr[i]];
		}
		return arr;
	}

	function carve(x: number, y: number) {
		maze[y][x] = " ";
		shuffle([0, 1, 2, 3]).forEach(d => {
			const dx = [0, 2, 0, -2][d];
			const dy = [-2, 0, 2, 0][d];
			const nx = x + dx;
			const ny = y + dy;
			if (nx > 0 && ny > 0 && nx < size - 1 && ny < size - 1 && maze[ny][nx] === "#") {
				maze[y + dy / 2][x + dx / 2] = " ";
				carve(nx, ny);
			}
		});
	}

	carve(1, 1);
	maze[1][1] = "S";
	maze[size - 2][size - 2] = "E";

	return maze.map(r => r.join(""));
}

function getRandomColor() {
	const colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E2"];
	return colors[Math.floor(Math.random() * colors.length)];
}

export default function MazeGame() {
	const { code } = useParams<{ code: string }>();
	const router = useRouter();

	const [loading, setLoading] = useState(true);
	const [winner, setWinner] = useState<string | null>(null);
	const [lobbyId, setLobbyId] = useState<number | null>(null);

	const sceneRef = useRef<THREE.Scene | null>(null);
	const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
	const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
	const playerMeshesRef = useRef<Map<string, { mesh: THREE.Mesh; label: THREE.Sprite }>>(new Map());
	const exitRef = useRef<THREE.Mesh | null>(null);
	const wallsRef = useRef<THREE.Mesh[]>([]);
	const mazeLayoutRef = useRef<string[]>([]);
	const spawnPosRef = useRef<{ x: number; z: number }>({ x: 2, z: 2 });

	const currentPlayerIdRef = useRef<string | null>(null);
	const currentPlayerNameRef = useRef<string | null>(null);
	const playerColorRef = useRef<string>("");
	const lastUpdateRef = useRef<number>(0);
	const channelRef = useRef<any>(null);

	useEffect(() => {
		if (!code) {
			router.push("/");
			return;
		}

		const supabase = createClient();
		let animationId: number;
		let mounted = true;

		const init = async () => {
			// Get player info from localStorage
			const playerId = localStorage.getItem("playerId");
			const playerName = localStorage.getItem("playerName");

			if (!playerId || !playerName) {
				router.push("/");
				return;
			}

			currentPlayerIdRef.current = playerId;
			currentPlayerNameRef.current = playerName;
			playerColorRef.current = getRandomColor();

			// Get lobby info
			const { data: lobbyData } = await supabase.from("lobbies").select("id").eq("code", code).single();

			if (!lobbyData) {
				router.push("/");
				return;
			}

			setLobbyId(lobbyData.id);

			// Setup Three.js scene
			const scene = new THREE.Scene();
			scene.background = new THREE.Color(0x0a0a0a);
			sceneRef.current = scene;

			const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
			camera.rotation.order = "YXZ";
			cameraRef.current = camera;

			const renderer = new THREE.WebGLRenderer({ antialias: true });
			renderer.setSize(window.innerWidth, window.innerHeight);
			document.body.appendChild(renderer.domElement);
			rendererRef.current = renderer;

			// Lighting
			const light = new THREE.DirectionalLight(0xffffff, 1);
			light.position.set(5, 10, 5);
			scene.add(light);

			const ambientLight = new THREE.AmbientLight(0x404040, 0.8);
			scene.add(ambientLight);

			// Floor
			const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: 0x1a1a2e }));
			floor.rotation.x = -Math.PI / 2;
			scene.add(floor);

			// Generate maze
			const layout = generateMaze(20);
			mazeLayoutRef.current = layout;
			const walls: THREE.Mesh[] = [];
			const wallMaterials = [new THREE.MeshStandardMaterial({ color: 0xe53e3e }), new THREE.MeshStandardMaterial({ color: 0x38a169 }), new THREE.MeshStandardMaterial({ color: 0x3182ce })];

			layout.forEach((row, z) => {
				row.split("").forEach((cell, x) => {
					if (cell === "#") {
						const wall = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 2), wallMaterials[Math.floor(Math.random() * wallMaterials.length)]);
						wall.position.set(x * 2, 1.5, z * 2);
						scene.add(wall);
						walls.push(wall);
					}

					if (cell === "S") {
						spawnPosRef.current = { x: x * 2, z: z * 2 };
						camera.position.set(x * 2, 1.6, z * 2);
					}

					if (cell === "E") {
						const exit = new THREE.Mesh(
							new THREE.BoxGeometry(1.5, 1.5, 1.5),
							new THREE.MeshStandardMaterial({
								color: 0x00ff88,
								emissive: 0x00ff88,
								emissiveIntensity: 0.5,
							})
						);
						exit.position.set(x * 2, 0.75, z * 2);
						scene.add(exit);
						exitRef.current = exit;
					}
				});
			});

			wallsRef.current = walls;

			// Insert initial position
			await supabase.from("maze_positions").upsert({
				lobby_id: lobbyData.id,
				player_id: playerId,
				player_name: playerName,
				x: spawnPosRef.current.x,
				y: 1.6,
				z: spawnPosRef.current.z,
				yaw: 0,
				pitch: 0,
				color: playerColorRef.current,
			});

			// Setup realtime channel
			channelRef.current = supabase
				.channel(`maze:${lobbyData.id}`)
				.on(
					"postgres_changes",
					{
						event: "*",
						schema: "public",
						table: "maze_positions",
						filter: `lobby_id=eq.${lobbyData.id}`,
					},
					payload => {
						if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
							const pos = payload.new as PlayerPosition;

							// Don't render our own player
							if (pos.player_id === currentPlayerIdRef.current) return;

							updatePlayerMesh(pos);
						} else if (payload.eventType === "DELETE") {
							const pos = payload.old as PlayerPosition;
							removePlayerMesh(pos.player_id);
						}
					}
				)
				.subscribe();

			// Load existing players
			const { data: existingPlayers } = await supabase.from("maze_positions").select("*").eq("lobby_id", lobbyData.id);

			if (existingPlayers) {
				existingPlayers.forEach((pos: PlayerPosition) => {
					if (pos.player_id !== playerId) {
						updatePlayerMesh(pos);
					}
				});
			}

			setLoading(false);

			// Input handling
			const keys: Record<string, boolean> = {};
			const onKeyDown = (e: KeyboardEvent) => (keys[e.key] = true);
			const onKeyUp = (e: KeyboardEvent) => (keys[e.key] = false);
			document.addEventListener("keydown", onKeyDown);
			document.addEventListener("keyup", onKeyUp);

			let yaw = 0;
			let pitch = 0;
			let velocity = 0;
			let isJumping = false;
			let isCrouching = false;
			const gravity = -0.01;
			const jumpStrength = 0.15;
			const groundLevel = 1.6;
			const crouchLevel = 1.2;

			document.body.addEventListener("click", () => {
				document.body.requestPointerLock();
			});

			const onMouseMove = (e: MouseEvent) => {
				if (document.pointerLockElement !== document.body) return;

				yaw -= e.movementX * 0.002;
				pitch -= e.movementY * 0.002;
				pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));

				camera.rotation.set(pitch, yaw, 0);
			};
			document.addEventListener("mousemove", onMouseMove);

			const raycaster = new THREE.Raycaster();

			function canMove(direction: THREE.Vector3, checkPlayers = true): boolean {
				raycaster.set(camera.position, direction);

				// Check walls
				const wallHits = raycaster.intersectObjects(walls);
				if (wallHits.length > 0 && wallHits[0].distance < 0.6) {
					return false;
				}

				// Check other players
				if (checkPlayers) {
					const playerMeshes = Array.from(playerMeshesRef.current.values()).map(p => p.mesh);
					const playerHits = raycaster.intersectObjects(playerMeshes);
					if (playerHits.length > 0 && playerHits[0].distance < 1.0) {
						return false;
					}
				}

				return true;
			}

			function updatePlayerMesh(pos: PlayerPosition) {
				if (!sceneRef.current) return;

				let playerObj = playerMeshesRef.current.get(pos.player_id);

				if (!playerObj) {
					// Create new player mesh (ball)
					const geometry = new THREE.SphereGeometry(0.4, 16, 16);
					const material = new THREE.MeshStandardMaterial({ color: pos.color });
					const mesh = new THREE.Mesh(geometry, material);

					// Create label
					const canvas = document.createElement("canvas");
					const context = canvas.getContext("2d")!;
					canvas.width = 256;
					canvas.height = 64;
					context.fillStyle = "rgba(0, 0, 0, 0.7)";
					context.fillRect(0, 0, 256, 64);
					context.font = "bold 32px Arial";
					context.fillStyle = "white";
					context.textAlign = "center";
					context.fillText(pos.player_name, 128, 42);

					const texture = new THREE.CanvasTexture(canvas);
					const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
					const label = new THREE.Sprite(spriteMaterial);
					label.scale.set(2, 0.5, 1);

					sceneRef.current.add(mesh);
					sceneRef.current.add(label);

					playerObj = { mesh, label };
					playerMeshesRef.current.set(pos.player_id, playerObj);
				}

				// Update position
				playerObj.mesh.position.set(pos.x, pos.y, pos.z);
				playerObj.label.position.set(pos.x, pos.y + 1, pos.z);
			}

			function removePlayerMesh(playerId: string) {
				const playerObj = playerMeshesRef.current.get(playerId);
				if (playerObj && sceneRef.current) {
					sceneRef.current.remove(playerObj.mesh);
					sceneRef.current.remove(playerObj.label);
					playerMeshesRef.current.delete(playerId);
				}
			}

			function animate() {
				if (!mounted) return;

				animationId = requestAnimationFrame(animate);

				const forward = new THREE.Vector3();
				camera.getWorldDirection(forward);
				forward.y = 0;
				forward.normalize();

				const right = new THREE.Vector3();
				right.crossVectors(forward, new THREE.Vector3(0, 1, 0));

				let speed = 0.05;
				let targetHeight = groundLevel;

				if (keys["Shift"]) {
					speed = 0.18;
				}

				if (keys["Control"]) {
					isCrouching = true;
					targetHeight = crouchLevel;
					speed = 0.03;
				} else {
					isCrouching = false;
				}

				if (!isJumping) {
					camera.position.y += (targetHeight - camera.position.y) * 0.2;
				}

				if (keys["w"] && canMove(forward)) camera.position.addScaledVector(forward, speed);
				if (keys["s"] && canMove(forward.clone().negate())) camera.position.addScaledVector(forward, -speed);
				if (keys["a"] && canMove(right.clone().negate())) camera.position.addScaledVector(right, -speed);
				if (keys["d"] && canMove(right)) camera.position.addScaledVector(right, speed);

				if (keys[" "] && !isJumping) {
					velocity = jumpStrength;
					isJumping = true;
				}

				velocity += gravity;
				camera.position.y += velocity;

				const currentGroundLevel = isCrouching ? crouchLevel : groundLevel;
				if (camera.position.y <= currentGroundLevel) {
					camera.position.y = currentGroundLevel;
					velocity = 0;
					isJumping = false;
				}

				// Update position to database (throttled)
				const now = Date.now();
				if (now - lastUpdateRef.current > 150) {
					lastUpdateRef.current = now;

					supabase.from("maze_positions").upsert({
						lobby_id: lobbyData!.id,
						player_id: playerId,
						player_name: playerName,
						x: camera.position.x,
						y: camera.position.y,
						z: camera.position.z,
						yaw: yaw,
						pitch: pitch,
						color: playerColorRef.current,
						last_updated: new Date().toISOString(),
					});
				}

				// Check win condition
				if (exitRef.current) {
					const dx = exitRef.current.position.x - camera.position.x;
					const dz = exitRef.current.position.z - camera.position.z;
					const distance = Math.sqrt(dx * dx + dz * dz);

					if (distance < 2.5 && !winner) {
						handleWin();
					}
				}

				// Make labels face camera
				playerMeshesRef.current.forEach(playerObj => {
					playerObj.label.lookAt(camera.position);
				});

				renderer.render(scene, camera);
			}

			async function handleWin() {
				setWinner(playerName!);

				// Notify all players
				await supabase.from("lobby_messages").insert({
					lobby_id: lobbyData!.id,
					message: `${playerName} won the maze!`,
					is_system: true,
				});

				// Wait 3 seconds then return to lobby
				setTimeout(async () => {
					// Clean up our position
					await supabase.from("maze_positions").delete().eq("lobby_id", lobbyData!.id).eq("player_id", playerId);

					router.push(`/lobby/${code}`);
				}, 3000);
			}

			animate();

			// Cleanup
			return () => {
				mounted = false;
				cancelAnimationFrame(animationId);

				document.removeEventListener("keydown", onKeyDown);
				document.removeEventListener("keyup", onKeyUp);
				document.removeEventListener("mousemove", onMouseMove);

				if (channelRef.current) {
					channelRef.current.unsubscribe();
				}

				if (rendererRef.current) {
					document.body.removeChild(rendererRef.current.domElement);
					rendererRef.current.dispose();
				}

				// Clean up our position from database
				supabase.from("maze_positions").delete().eq("lobby_id", lobbyData.id).eq("player_id", playerId);
			};
		};

		init();

		return () => {
			mounted = false;
		};
	}, [code, router]);

	if (loading) {
		return (
			<div
				style={{
					position: "fixed",
					inset: 0,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					background: "#0a0a0a",
					color: "white",
					fontSize: "24px",
				}}
			>
				Loading maze...
			</div>
		);
	}

	if (winner) {
		return (
			<div
				style={{
					position: "fixed",
					inset: 0,
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					background: "rgba(0, 0, 0, 0.9)",
					color: "white",
					zIndex: 1000,
				}}
			>
				<h1 style={{ fontSize: "48px", marginBottom: "20px" }}>🎉 {winner} Won! 🎉</h1>
				<p style={{ fontSize: "20px" }}>Returning to lobby...</p>
			</div>
		);
	}

	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				background: "#0a0a0a",
			}}
		>
			<div
				style={{
					position: "absolute",
					top: "20px",
					left: "20px",
					color: "white",
					background: "rgba(0, 0, 0, 0.7)",
					padding: "10px 20px",
					borderRadius: "8px",
					fontFamily: "monospace",
				}}
			>
				<div>WASD - Move</div>
				<div>Shift - Sprint</div>
				<div>Space - Jump</div>
				<div>Ctrl - Crouch</div>
				<div style={{ marginTop: "10px" }}>Click to lock mouse</div>
			</div>
		</div>
	);
}
