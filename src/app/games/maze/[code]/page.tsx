"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase-client";
import * as THREE from "three";
import ChatBox from "../../../chatbox";

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

function generateMaze(size: number) {
	const maze = Array.from({ length: size }, () => Array(size).fill("#"));
	const dirs = [
		[0, -2],
		[2, 0],
		[0, 2],
		[-2, 0],
	];

	function shuffle(arr: number[][]) {
		for (let i = arr.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[arr[i], arr[j]] = [arr[j], arr[i]];
		}
		return arr;
	}

	function carve(x: number, y: number) {
		maze[y][x] = " ";
		shuffle(dirs.slice()).forEach(([dx, dy]) => {
			const nx = x + dx;
			const ny = y + dy;
			if (nx > 0 && ny > 0 && nx < size - 1 && ny < size - 1 && maze[ny][nx] === "#") {
				maze[y + dy / 2][x + dx / 2] = " ";
				carve(nx, ny);
			}
		});
	}

	carve(1, 1);

	const queue: [number, number][] = [[1, 1]];
	const dist = Array.from({ length: size }, () => Array(size).fill(-1));
	dist[1][1] = 0;

	let fx = 1;
	let fy = 1;

	while (queue.length) {
		const [x, y] = queue.shift()!;
		if (dist[y][x] > dist[fy][fx]) {
			fx = x;
			fy = y;
		}
		for (const [dx, dy] of [
			[1, 0],
			[-1, 0],
			[0, 1],
			[0, -1],
		]) {
			const nx = x + dx;
			const ny = y + dy;
			if (maze[ny]?.[nx] === " " && dist[ny][nx] === -1) {
				dist[ny][nx] = dist[y][x] + 1;
				queue.push([nx, ny]);
			}
		}
	}

	maze[1][1] = "S";
	maze[fy][fx] = "E";

	return maze.map(r => r.join(""));
}

function getRandomColor() {
	const colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E2"];
	return colors[Math.floor(Math.random() * colors.length)];
}

function removeCanvas() {
	let canvas = document.querySelector("canvas");

	if (canvas) {
		canvas.width = 0;
		canvas.height = 0;
		canvas.remove();
		canvas = null;
	}
}

export default function MazeGame() {
	const { code } = useParams<{ code: string }>();
	const router = useRouter();

	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [winner, setWinner] = useState<string | null>(null);
	const [lobbyId, setLobbyId] = useState<number | null>(null);
	const [waitingForMaze, setWaitingForMaze] = useState(false);
	const [messages, setMessages] = useState<Message[]>([]);
	const [messageInput, setMessageInput] = useState("");
	const [isChatFocused, setIsChatFocused] = useState(false);
	const [players, setPlayers] = useState<Player[]>([]);

	const sceneRef = useRef<THREE.Scene | null>(null);
	const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
	const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
	const playerMeshesRef = useRef<Map<string, { mesh: THREE.Mesh; label: THREE.Sprite; targetPos: THREE.Vector3 }>>(new Map());
	const exitRef = useRef<THREE.Mesh | null>(null);
	const wallsRef = useRef<THREE.Mesh[]>([]);
	const mazeLayoutRef = useRef<string[]>([]);
	const spawnPosRef = useRef<{ x: number; z: number }>({ x: 2, z: 2 });
	const playerLightRef = useRef<THREE.PointLight | null>(null);

	const currentPlayerIdRef = useRef<string | null>(null);
	const currentPlayerNameRef = useRef<string | null>(null);
	const playerColorRef = useRef<string>("");
	const lastUpdateRef = useRef<number>(0);
	const channelRef = useRef<any>(null);
	const lobbyChannelRef = useRef<any>(null);
	const messagesChannelRef = useRef<any>(null);
	const playersChannelRef = useRef<any>(null);
	const gameEndedRef = useRef<boolean>(false);

	useEffect(() => {
		if (!code) {
			router.push("/");
			return;
		}

		const supabase = createClient();
		let animationId: number;
		let mounted = true;

		const init = async () => {
			try {
				removeCanvas();
				const playerId = localStorage.getItem("playerId");
				const playerName = localStorage.getItem("playerName");

				if (!playerId || !playerName) {
					setError("Player info not found");
					router.push("/");
					return;
				}

				currentPlayerIdRef.current = playerId;
				currentPlayerNameRef.current = playerName;
				playerColorRef.current = getRandomColor();

				const { data: lobbyData, error: lobbyError } = await supabase.from("lobbies").select("id, settings").eq("code", code).single();

				if (lobbyError || !lobbyData) {
					setError("Lobby not found");
					router.push("/");
					return;
				}

				setLobbyId(lobbyData.id);

				const { data: messagesData } = await supabase.from("lobby_messages").select("*").eq("lobby_id", lobbyData.id).order("created_at");
				setMessages(messagesData || []);

				const { data: playersData } = await supabase.from("lobby_players").select("player_id, name, is_muted, is_admin").eq("lobby_id", lobbyData.id);
				setPlayers(playersData || []);

				const { data: messages } = await supabase.from("lobby_messages").select("message").eq("lobby_id", lobbyData.id).eq("is_system", true).like("message", "% won the maze!").order("created_at", { ascending: false }).limit(1);

				if (messages && messages.length > 0) {
					const winnerName = messages[0].message.replace(" won the maze!", "");
					setWinner(winnerName);
					gameEndedRef.current = true;
					setTimeout(() => router.push(`/lobby/${code}`), 3000);
					return;
				}

				const { data: playerData } = await supabase.from("lobby_players").select("is_admin").eq("lobby_id", lobbyData.id).eq("player_id", playerId).single();

				const isAdmin = playerData?.is_admin || false;

				const mazeSize = lobbyData.settings?.mazeSize || 20;
				let layout: string[] | undefined = lobbyData.settings?.mazeLayout;

				if (!layout) {
					if (isAdmin) {
						layout = generateMaze(mazeSize);
						const { error: updateError } = await supabase
							.from("lobbies")
							.update({
								settings: {
									...lobbyData.settings,
									mazeLayout: layout,
								},
							})
							.eq("id", lobbyData.id);

						if (updateError) {
							console.error("Failed to save maze:", updateError);
							setError("Failed to generate maze");
							return;
						}
					} else {
						setWaitingForMaze(true);
						setLoading(false);

						lobbyChannelRef.current = supabase
							.channel(`lobby-settings:${lobbyData.id}`)
							.on(
								"postgres_changes",
								{
									event: "UPDATE",
									schema: "public",
									table: "lobbies",
									filter: `id=eq.${lobbyData.id}`,
								},
								payload => {
									const newSettings = (payload.new as any).settings;
									if (newSettings?.mazeLayout) {
										setWaitingForMaze(false);
										lobbyChannelRef.current?.unsubscribe();
										init();
									}
								}
							)
							.subscribe(async status => {
								if (status === "SUBSCRIBED") {
									const { data } = await supabase.from("lobbies").select("settings").eq("id", lobbyData.id).single();

									if (data?.settings?.mazeLayout) {
										setWaitingForMaze(false);
										lobbyChannelRef.current?.unsubscribe();
										init();
									}
								}
							});

						return;
					}
				}

				const scene = new THREE.Scene();
				scene.background = new THREE.Color(0x0a0a0a);
				scene.fog = new THREE.Fog(0x0a0a0a, 1, 25);
				sceneRef.current = scene;

				const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
				camera.rotation.order = "YXZ";
				cameraRef.current = camera;

				const renderer = new THREE.WebGLRenderer({ antialias: true });
				renderer.setSize(window.innerWidth, window.innerHeight);
				document.body.appendChild(renderer.domElement);
				rendererRef.current = renderer;

				const playerLight = new THREE.PointLight(0xffffff, 1.5, 20, 2);
				playerLight.position.copy(camera.position);
				scene.add(playerLight);
				playerLightRef.current = playerLight;

				const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
				scene.add(ambientLight);

				const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: 0x1a1a2e }));
				floor.rotation.x = -Math.PI / 2;
				scene.add(floor);

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

							const roof = new THREE.Mesh(new THREE.BoxGeometry(2, 0.2, 2), new THREE.MeshStandardMaterial({ color: 0x2d2d2d }));
							roof.position.set(x * 2, 3.1, z * 2);
							scene.add(roof);
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

				const { error: insertError } = await supabase.from("maze_positions").upsert(
					{
						lobby_id: lobbyData.id,
						player_id: playerId,
						player_name: playerName,
						x: spawnPosRef.current.x,
						y: 1.6,
						z: spawnPosRef.current.z,
						yaw: 0,
						pitch: 0,
						color: playerColorRef.current,
					},
					{
						onConflict: "lobby_id,player_id",
					}
				);

				if (insertError) {
					console.error("Insert error:", insertError);
					setError(`Position insert error: ${insertError.message}`);
					return;
				}

				playersChannelRef.current = supabase
					.channel(`lobby-players:${lobbyData.id}`)
					.on(
						"postgres_changes",
						{
							event: "*",
							schema: "public",
							table: "lobby_players",
							filter: `lobby_id=eq.${lobbyData.id}`,
						},
						async () => {
							const { data } = await supabase.from("lobby_players").select("player_id, name, is_muted, is_admin").eq("lobby_id", lobbyData.id);
							setPlayers(data || []);
						}
					)
					.subscribe();

				messagesChannelRef.current = supabase
					.channel(`lobby-messages:${lobbyData.id}`)
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

							if (message.is_system && message.message.includes("won the maze!")) {
								const winnerName = message.message.replace(" won the maze!", "");
								if (!gameEndedRef.current) {
									gameEndedRef.current = true;
									setWinner(winnerName);
									setTimeout(async () => {
										await supabase.from("maze_positions").delete().eq("lobby_id", lobbyData.id).eq("player_id", playerId);
										router.push(`/lobby/${code}`);
									}, 3000);
								}
							}

							if (message.is_system && message.message.startsWith("KICKED:")) {
								const kickedPlayerId = message.message.replace("KICKED:", "");
								if (kickedPlayerId === playerId) {
									gameEndedRef.current = true;
									setTimeout(() => router.push("/"), 2000);
								}
							}
						}
					)
					.subscribe();

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

								if (pos.player_id === currentPlayerIdRef.current) return;

								updatePlayerMesh(pos);
							} else if (payload.eventType === "DELETE") {
								const pos = payload.old as PlayerPosition;
								removePlayerMesh(pos.player_id);
							}
						}
					)
					.subscribe();

				const { data: existingPlayers, error: playersError } = await supabase.from("maze_positions").select("*").eq("lobby_id", lobbyData.id);

				if (!playersError && existingPlayers) {
					existingPlayers.forEach((pos: PlayerPosition) => {
						if (pos.player_id !== playerId) {
							updatePlayerMesh(pos);
						}
					});
				}

				if (!mounted) return;
				setLoading(false);

				const keys: Record<string, boolean> = {};
				const onKeyDown = (e: KeyboardEvent) => {
					if (isChatFocused) {
						if (e.key === "Escape") {
							setIsChatFocused(false);
							document.body.requestPointerLock();
						}
						return;
					}

					keys[e.key] = true;
					if (e.key === "t" || e.key === "T" || e.key === "Enter") {
						e.preventDefault();
						setIsChatFocused(true);
						document.exitPointerLock();
					}
				};

				const onKeyUp = (e: KeyboardEvent) => {
					if (isChatFocused) return;
					keys[e.key] = false;
				};
                
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

				const targetPosition = new THREE.Vector3(camera.position.x, camera.position.y, camera.position.z);
				const smoothingFactor = 0.3;

				document.body.addEventListener("click", () => {
					if (!isChatFocused) {
						document.body.requestPointerLock();
					}
				});

				const onMouseMove = (e: MouseEvent) => {
					if (document.pointerLockElement !== document.body || isChatFocused) return;

					yaw -= e.movementX * 0.002;
					pitch -= e.movementY * 0.002;
					pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));

					camera.rotation.set(pitch, yaw, 0);
				};
				document.addEventListener("mousemove", onMouseMove);

				const raycaster = new THREE.Raycaster();

				function canMove(newPos: THREE.Vector3, moveDir: THREE.Vector3): { canMove: boolean; slideVector: THREE.Vector3 | null } {
					const directions = [
						new THREE.Vector3(1, 0, 0),
						new THREE.Vector3(-1, 0, 0),
						new THREE.Vector3(0, 0, 1),
						new THREE.Vector3(0, 0, -1),
						new THREE.Vector3(0.707, 0, 0.707),
						new THREE.Vector3(-0.707, 0, 0.707),
						new THREE.Vector3(0.707, 0, -0.707),
						new THREE.Vector3(-0.707, 0, -0.707),
						new THREE.Vector3(0.383, 0, 0.924),
						new THREE.Vector3(-0.383, 0, 0.924),
						new THREE.Vector3(0.383, 0, -0.924),
						new THREE.Vector3(-0.383, 0, -0.924),
						new THREE.Vector3(0.924, 0, 0.383),
						new THREE.Vector3(-0.924, 0, 0.383),
						new THREE.Vector3(0.924, 0, -0.383),
						new THREE.Vector3(-0.924, 0, -0.383),
					];
					const radius = 0.6;
					let closestHit = null;
					let minDistance = Infinity;

					for (const dir of directions) {
						raycaster.set(newPos, dir);
						const wallHits = raycaster.intersectObjects(walls);
						if (wallHits.length > 0 && wallHits[0].distance < radius) {
							if (wallHits[0].distance < minDistance) {
								minDistance = wallHits[0].distance;
								closestHit = { point: wallHits[0].point, normal: wallHits[0].face?.normal, object: wallHits[0].object };
							}
						}
					}

					const playerMeshes = Array.from(playerMeshesRef.current.values()).map(p => p.mesh);
					for (const dir of directions) {
						raycaster.set(newPos, dir);
						const playerHits = raycaster.intersectObjects(playerMeshes);
						if (playerHits.length > 0 && playerHits[0].distance < 0.8) {
							return { canMove: false, slideVector: null };
						}
					}

					if (closestHit && closestHit.normal) {
						const worldNormal = closestHit.normal.clone();
						closestHit.object.getWorldQuaternion(new THREE.Quaternion()).normalize();

						const dot = moveDir.dot(worldNormal);
						const slideVector = moveDir.clone().sub(worldNormal.multiplyScalar(dot));
						slideVector.normalize();

						return { canMove: false, slideVector };
					}

					return { canMove: true, slideVector: null };
				}

				function updatePlayerMesh(pos: PlayerPosition) {
					if (!sceneRef.current) return;

					let playerObj = playerMeshesRef.current.get(pos.player_id);

					if (!playerObj) {
						const geometry = new THREE.SphereGeometry(0.4, 16, 16);
						const material = new THREE.MeshStandardMaterial({ color: pos.color });
						const mesh = new THREE.Mesh(geometry, material);

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

						const targetPos = new THREE.Vector3(pos.x, pos.y, pos.z);
						mesh.position.copy(targetPos);
						label.position.set(pos.x, pos.y + 1, pos.z);

						playerObj = { mesh, label, targetPos };
						playerMeshesRef.current.set(pos.player_id, playerObj);
					} else {
						playerObj.targetPos.set(pos.x, pos.y, pos.z);
					}
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
					if (!mounted || gameEndedRef.current) return;

					animationId = requestAnimationFrame(animate);

					if (isChatFocused) {
						renderer.render(scene, camera);

						playerMeshesRef.current.forEach(playerObj => {
							playerObj.mesh.position.lerp(playerObj.targetPos, 0.2);
							playerObj.label.position.set(playerObj.mesh.position.x, playerObj.mesh.position.y + 1, playerObj.mesh.position.z);
							playerObj.label.lookAt(camera.position);
						});

						return;
					}

					const forward = new THREE.Vector3();
					camera.getWorldDirection(forward);
					forward.y = 0;
					forward.normalize();

					const right = new THREE.Vector3();
					right.crossVectors(forward, new THREE.Vector3(0, 1, 0));

					let speed = 0.07;
					let targetHeight = groundLevel;

					if (keys["Shift"]) {
						speed = 0.14;
					}

					if (keys["Control"]) {
						isCrouching = true;
						targetHeight = crouchLevel;
						speed = 0.03;
					} else {
						isCrouching = false;
					}

					if (!isJumping) {
						targetPosition.y += (targetHeight - targetPosition.y) * 0.2;
					}

					const newPos = targetPosition.clone();

					if (keys["w"]) {
						newPos.addScaledVector(forward, speed);
						const moveCheck = canMove(newPos, forward);
						if (moveCheck.canMove) {
							targetPosition.copy(newPos);
						} else if (moveCheck.slideVector) {
							newPos.copy(targetPosition);
							newPos.addScaledVector(moveCheck.slideVector, speed * 0.5);
							const slideCheck = canMove(newPos, moveCheck.slideVector);
							if (slideCheck.canMove) {
								targetPosition.copy(newPos);
							}
						}
					}
					if (keys["s"]) {
						newPos.copy(targetPosition);
						const backwardDir = forward.clone().negate();
						newPos.addScaledVector(forward, -speed);
						const moveCheck = canMove(newPos, backwardDir);
						if (moveCheck.canMove) {
							targetPosition.copy(newPos);
						} else if (moveCheck.slideVector) {
							newPos.copy(targetPosition);
							newPos.addScaledVector(moveCheck.slideVector, speed * 0.5);
							const slideCheck = canMove(newPos, moveCheck.slideVector);
							if (slideCheck.canMove) {
								targetPosition.copy(newPos);
							}
						}
					}
					if (keys["a"]) {
						newPos.copy(targetPosition);
						newPos.addScaledVector(right, -speed);
						const moveCheck = canMove(newPos, right.clone().negate());
						if (moveCheck.canMove) {
							targetPosition.copy(newPos);
						} else if (moveCheck.slideVector) {
							newPos.copy(targetPosition);
							newPos.addScaledVector(moveCheck.slideVector, speed * 0.5);
							const slideCheck = canMove(newPos, moveCheck.slideVector);
							if (slideCheck.canMove) {
								targetPosition.copy(newPos);
							}
						}
					}
					if (keys["d"]) {
						newPos.copy(targetPosition);
						newPos.addScaledVector(right, speed);
						const moveCheck = canMove(newPos, right);
						if (moveCheck.canMove) {
							targetPosition.copy(newPos);
						} else if (moveCheck.slideVector) {
							newPos.copy(targetPosition);
							newPos.addScaledVector(moveCheck.slideVector, speed * 0.5);
							const slideCheck = canMove(newPos, moveCheck.slideVector);
							if (slideCheck.canMove) {
								targetPosition.copy(newPos);
							}
						}
					}

					if (keys[" "] && !isJumping) {
						velocity = jumpStrength;
						isJumping = true;
					}

					velocity += gravity;
					targetPosition.y += velocity;

					const currentGroundLevel = isCrouching ? crouchLevel : groundLevel;
					if (targetPosition.y <= currentGroundLevel) {
						targetPosition.y = currentGroundLevel;
						velocity = 0;
						isJumping = false;
					}

					camera.position.lerp(targetPosition, smoothingFactor);

					if (playerLightRef.current) {
						playerLightRef.current.position.copy(camera.position);
					}

					const now = Date.now();
					if (now - lastUpdateRef.current > 50) {
						lastUpdateRef.current = now;

						const updateData = {
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
						};

						supabase
							.from("maze_positions")
							.upsert(updateData, { onConflict: "lobby_id,player_id" })
							.then(({ error }) => {
								if (error) {
									console.error("Position update error:", error);
								}
							});
					}

					if (exitRef.current && !gameEndedRef.current) {
						const dx = exitRef.current.position.x - camera.position.x;
						const dz = exitRef.current.position.z - camera.position.z;
						const distance = Math.sqrt(dx * dx + dz * dz);

						if (distance < 2.5) {
							handleWin();
						}
					}

					playerMeshesRef.current.forEach(playerObj => {
						playerObj.mesh.position.lerp(playerObj.targetPos, 0.2);
						playerObj.label.position.set(playerObj.mesh.position.x, playerObj.mesh.position.y + 1, playerObj.mesh.position.z);
						playerObj.label.lookAt(camera.position);
					});

					renderer.render(scene, camera);
				}

				async function handleWin() {
					if (gameEndedRef.current) return;

					gameEndedRef.current = true;
					setWinner(playerName!);

					await supabase.from("lobby_messages").insert({
						lobby_id: lobbyData!.id,
						message: `${playerName} won the maze!`,
						is_system: true,
					});

					setTimeout(async () => {
						await supabase.from("maze_positions").delete().eq("lobby_id", lobbyData!.id).eq("player_id", playerId);
						router.push(`/lobby/${code}`);
					}, 3000);
				}

				animate();

				return () => {
					mounted = false;
					cancelAnimationFrame(animationId);

					if (document.pointerLockElement) {
						document.exitPointerLock();
					}

					document.removeEventListener("keydown", onKeyDown);
					document.removeEventListener("keyup", onKeyUp);
					document.removeEventListener("mousemove", onMouseMove);

					if (channelRef.current) {
						channelRef.current.unsubscribe();
					}

					if (messagesChannelRef.current) {
						messagesChannelRef.current.unsubscribe();
					}

					if (playersChannelRef.current) {
						playersChannelRef.current.unsubscribe();
					}

					if (rendererRef.current?.domElement?.parentNode) {
						rendererRef.current.domElement.parentNode.removeChild(rendererRef.current.domElement);
					}
					if (rendererRef.current) {
						rendererRef.current.dispose();
						rendererRef.current = null;
					}

					if (lobbyId && currentPlayerIdRef.current && !gameEndedRef.current) {
						supabase.from("maze_positions").delete().eq("lobby_id", lobbyId).eq("player_id", currentPlayerIdRef.current);
					}
				};
			} catch (err) {
				console.error("Init error:", err);
				if (mounted) {
					const errorMsg = err instanceof Error ? err.message : String(err);
					setError(`Exception: ${errorMsg}`);
					setTimeout(() => router.push("/"), 2000);
				}
			}
		};

		init();

		return () => {
			mounted = false;
			if (lobbyChannelRef.current) {
				lobbyChannelRef.current.unsubscribe();
			}
		};
	}, [code, router, isChatFocused]);

	const handleSendMessage = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!messageInput.trim() || !lobbyId) return;

		const currentPlayer = players.find(p => p.player_id === currentPlayerIdRef.current);
		if (currentPlayer?.is_muted) return;

		const supabase = createClient();
		await supabase.from("lobby_messages").insert({
			lobby_id: lobbyId,
			player_id: currentPlayerIdRef.current,
			player_name: currentPlayerNameRef.current,
			message: messageInput.trim(),
			is_system: false,
		});

		setMessageInput("");
		setIsChatFocused(false);
		document.body.requestPointerLock();
	};

	const currentPlayer = players.find(p => p.player_id === currentPlayerIdRef.current);
	const isMuted = currentPlayer?.is_muted || false;
	const isAdmin = currentPlayer?.is_admin || false;

	const handleKickPlayer = async (playerId: string, playerName: string) => {
		if (!lobbyId || playerId === currentPlayerIdRef.current) return;

		const supabase = createClient();
		await supabase.from("lobby_players").delete().eq("lobby_id", lobbyId).eq("player_id", playerId);

		await supabase.from("lobby_messages").insert({
			lobby_id: lobbyId,
			message: `${playerName} was kicked by admin`,
			is_system: true,
		});

		await supabase.from("lobby_messages").insert({
			lobby_id: lobbyId,
			message: `KICKED:${playerId}`,
			is_system: true,
		});
	};

	const handleToggleMute = async (playerId: string, playerName: string) => {
		if (!lobbyId) return;

		const target = players.find(p => p.player_id === playerId);
		if (!target) return;

		const supabase = createClient();

		const { data: playerData } = await supabase.from("lobby_players").select("is_muted").eq("lobby_id", lobbyId).eq("player_id", playerId).single();

		if (!playerData) return;

		await supabase.from("lobby_players").update({ is_muted: !playerData.is_muted }).eq("lobby_id", lobbyId).eq("player_id", playerId);

		await supabase.from("lobby_messages").insert({
			lobby_id: lobbyId,
			message: `${playerName} ${playerData.is_muted ? "unmuted by admin" : "muted by admin"}`,
			is_system: true,
		});
	};

	const handleChatFocusChange = (focused: boolean) => {
		setIsChatFocused(focused);
		if (focused) {
			document.exitPointerLock();
		} else {
			document.body.requestPointerLock();
		}
	};

	if (error) {
		return (
			<div
				style={{
					position: "fixed",
					inset: 0,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					background: "#0a0a0a",
					color: "#ff6b6b",
					fontSize: "24px",
				}}
			>
				Error: {error}
			</div>
		);
	}

	if (waitingForMaze) {
		return (
			<div
				style={{
					position: "fixed",
					inset: 0,
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					background: "#0a0a0a",
					color: "white",
					fontSize: "24px",
					gap: "20px",
				}}
			>
				<div>Waiting for admin to generate maze...</div>
				<div style={{ fontSize: "16px", opacity: 0.7 }}>The game will start automatically once the maze is ready</div>
			</div>
		);
	}

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
				background: "",
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
				<div>T/Enter - Open Chat</div>
				<div>ESC - Close Chat</div>
				<div style={{ marginTop: "10px" }}>Click to lock mouse</div>
			</div>

			<ChatBox messages={messages} players={players} currentPlayerId={currentPlayerIdRef.current} isChatFocused={isChatFocused} messageInput={messageInput} isMuted={isMuted} isAdmin={isAdmin} onChatFocusChange={handleChatFocusChange} onMessageInputChange={setMessageInput} onSendMessage={handleSendMessage} onToggleMute={handleToggleMute} onKickPlayer={handleKickPlayer} />
		</div>
	);
}
