import { prompts } from "./prompts";

// PREVENT DUPLICATE PROMPTS IN ONE GAME!!

export default function MyComponent() {
	return (
		<>
			<h1>Ruined & Unruined</h1>
            {prompts}
		</>
	);
}
