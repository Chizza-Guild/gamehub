"use client";

import { useEffect } from "react";
import * as THREE from "three";

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

export default function Page() {
	useEffect(() => {
		const scene = new THREE.Scene();

		const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
		camera.rotation.order = "YXZ";

		const renderer = new THREE.WebGLRenderer();
		renderer.setSize(window.innerWidth, window.innerHeight);
		document.body.appendChild(renderer.domElement);

		const light = new THREE.DirectionalLight(0xffffff, 1);
		light.position.set(5, 10, 5);
		scene.add(light);

		const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
		scene.add(ambientLight);

		const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: 0x1a1a2e }));
		floor.rotation.x = -Math.PI / 2;
		scene.add(floor);

		const walls: THREE.Mesh[] = [];
		const wallMaterials = [new THREE.MeshStandardMaterial({ color: 0xe53e3e }), new THREE.MeshStandardMaterial({ color: 0x38a169 }), new THREE.MeshStandardMaterial({ color: 0x3182ce })];

		const layout = generateMaze(20);
		let exit: THREE.Mesh | null = null;

		layout.forEach((row, z) => {
			row.split("").forEach((cell, x) => {
				if (cell === "#") {
					const wall = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 2), wallMaterials[Math.floor(Math.random() * wallMaterials.length)]);
					wall.position.set(x * 2, 1.5, z * 2);
					scene.add(wall);
					walls.push(wall);
				}

				if (cell === "S") {
					camera.position.set(x * 2, 1.6, z * 2);
				}

				if (cell === "E") {
					exit = new THREE.Mesh(
						new THREE.BoxGeometry(1.5, 1.5, 1.5),
						new THREE.MeshStandardMaterial({
							color: 0x00ff88,
							emissive: 0x00ff88,
							emissiveIntensity: 0.3,
						})
					);
					exit.position.set(x * 2, 0.75, z * 2);
					scene.add(exit);
				}
			});
		});

		const keys: Record<string, boolean> = {};
		document.addEventListener("keydown", e => (keys[e.key] = true));
		document.addEventListener("keyup", e => (keys[e.key] = false));

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

		document.addEventListener("mousemove", e => {
			if (document.pointerLockElement !== document.body) return;

			yaw -= e.movementX * 0.002;
			pitch -= e.movementY * 0.002;
			pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));

			camera.rotation.set(pitch, yaw, 0);
		});

		const raycaster = new THREE.Raycaster();

		function canMove(direction: THREE.Vector3) {
			raycaster.set(camera.position, direction);
			const hits = raycaster.intersectObjects(walls);
			return hits.length === 0 || hits[0].distance > 0.6;
		}

		function animate() {
			requestAnimationFrame(animate);

			const forward = new THREE.Vector3();
			camera.getWorldDirection(forward);
			forward.y = 0;
			forward.normalize();

			const right = new THREE.Vector3();
			right.crossVectors(forward, new THREE.Vector3(0, 1, 0));

			// Sprint and crouch
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

			// Smooth crouch transition
			if (!isJumping) {
				camera.position.y += (targetHeight - camera.position.y) * 0.2;
			}

			if (keys["w"] && canMove(forward)) camera.position.addScaledVector(forward, speed);
			if (keys["s"] && canMove(forward.clone().negate())) camera.position.addScaledVector(forward, -speed);
			if (keys["a"] && canMove(right.clone().negate())) camera.position.addScaledVector(right, -speed);
			if (keys["d"] && canMove(right)) camera.position.addScaledVector(right, speed);

			// Jumping
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

			if (exit) {
				const dx = exit.position.x - camera.position.x;
				const dz = exit.position.z - camera.position.z;
				const distance = Math.sqrt(dx * dx + dz * dz);

				if (distance < 2.5) {
					alert("You escaped!");
					location.reload();
				}
			}

			renderer.render(scene, camera);
		}

		animate();

		return () => {
			renderer.dispose();
			document.body.removeChild(renderer.domElement);
		};
	}, []);

	return null;
}
