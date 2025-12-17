"use client";
import { useRef, useState } from "react";

type DrawPath = {
  d: string;
  color: string;
  size: number;
};

export default function Draw() {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [paths, setPaths] = useState<DrawPath[]>([]);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const [hexVal, setHexVal] = useState("#000000");
  const [size, setSize] = useState(6);

  function getPoint(e: React.MouseEvent) {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();

    pt.x = e.clientX;
    pt.y = e.clientY;

    const ctm = svg.getScreenCTM()!;
    const p = pt.matrixTransform(ctm.inverse());

    return { x: p.x, y: p.y };
  }

  function handleMouseDown(e: React.MouseEvent) {
    const { x, y } = getPoint(e);
    setIsDrawing(true);
    setCurrentPath(`M ${x} ${y}`);
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!isDrawing || !currentPath) return;
    const { x, y } = getPoint(e);
    setCurrentPath((p) => `${p} L ${x} ${y}`);
  }

  function handleMouseUp() {
    if (currentPath) {
      setPaths((p) => [
        ...p,
        { d: currentPath, color: hexVal, size },
      ]);
    }
    setCurrentPath(null);
    setIsDrawing(false);
  }

  function saveAsJSON() {
    const data = {
        version: 1,
        width: 400,
        height: 400,
        image: "/images/Tshirt.png",
        paths,
    };

    const json = JSON.stringify(data, null, 2);

    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "drawing.json";
    a.click();

    URL.revokeObjectURL(url);
}

    function loadFromJSON(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            const data = JSON.parse(reader.result as string);
            setPaths(data.paths);
        };
        reader.readAsText(file);
    }


    return (
        <>
        {/* Controls */}
        <div style={{ marginBottom: 8 }}>
            <input
            type="range"
            min={1}
            max={30}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            />
            <span> {size}px</span>

            <input
            type="color"
            value={hexVal}
            onChange={(e) => setHexVal(e.target.value)}
            style={{ marginLeft: 10 }}
            />
            

        </div>

        <button onClick={saveAsJSON}>Save as JSON</button>
        <input
            type="file"
            accept="application/json"
            onChange={(e) => loadFromJSON(e)}
        />

        {/* Drawing SVG */}
        <svg
            ref={svgRef}
            width={400}
            height={400}
            viewBox="0 0 400 400"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ border: "1px solid black", cursor: "crosshair" }}
        >
            <image
            href="/images/Tshirt.png"
            x="0"
            y="0"
            width="400"
            height="400"
            preserveAspectRatio="none"
            />

            {paths.map((p, i) => (
            <path
                key={i}
                d={p.d}
                fill="none"
                stroke={p.color}
                strokeWidth={p.size}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            ))}

            {currentPath && (
            <path
                d={currentPath}
                fill="none"
                stroke={hexVal}
                strokeWidth={size}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            )}
        </svg>
        </>
  );
}
