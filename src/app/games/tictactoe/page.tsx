'use client';

import { useState, useEffect } from 'react';

/* ---------- Square ---------- */
type SquareProps = {
  value: string | null;
  onSquareClick: () => void;
};

type Difficulty = "easy" | "medium" | "hard";
type ResetButtonProps = {
  onReset: () => void;
};

function ResetButton({ onReset }: ResetButtonProps) {
  return (
    <button
      onClick={onReset}
      style={{
        marginTop: 10,
        padding: '6px 12px',
        border: '2px solid black',
        background: 'white',
        cursor: 'pointer',
      }}
    >
      Reset Game
    </button>
  );
}

function Square({ value, onSquareClick }: SquareProps) {
  return (
    <button
      onClick={onSquareClick}
      style={{
        width: 60,
        height: 60,
        fontSize: 24,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        margin: 2,
        border: '2px solid black',
        background: 'white',
        cursor: 'pointer',
      }}
    >
      {value}
    </button>
  );
}

/* ---------- Board ---------- */
type BoardProps = {
  squares: (string | null)[];
  onPlay: (squares: (string | null)[]) => void;
};

function Board({ squares, onPlay }: BoardProps) {
  function handleClick(i: number) {
    // block invalid moves
    if (squares[i] || calculateWinner(squares)) return;

    const nextSquares = squares.slice();
    nextSquares[i] = 'X'; // player is always X
    onPlay(nextSquares);
  }

  const winner = calculateWinner(squares);
  const status = winner
    ? `Winner: ${winner}`
    : 'You are X. Bot is O.';

  return (
    <>
      <div style={{ marginBottom: 10 }}>{status}</div>

      <div style={{ display: 'flex' }}>
        <Square value={squares[0]} onSquareClick={() => handleClick(0)} />
        <Square value={squares[1]} onSquareClick={() => handleClick(1)} />
        <Square value={squares[2]} onSquareClick={() => handleClick(2)} />
      </div>

      <div style={{ display: 'flex' }}>
        <Square value={squares[3]} onSquareClick={() => handleClick(3)} />
        <Square value={squares[4]} onSquareClick={() => handleClick(4)} />
        <Square value={squares[5]} onSquareClick={() => handleClick(5)} />
      </div>

      <div style={{ display: 'flex' }}>
        <Square value={squares[6]} onSquareClick={() => handleClick(6)} />
        <Square value={squares[7]} onSquareClick={() => handleClick(7)} />
        <Square value={squares[8]} onSquareClick={() => handleClick(8)} />
      </div>
    </>
  );
}

/* ---------- Game (with Bot) ---------- */
export default function Page() {
  const [history, setHistory] = useState<(string | null)[][]>([
    Array(9).fill(null),
  ]);
  const [currentMove, setCurrentMove] = useState(0);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");

  const xIsNext = currentMove % 2 === 0;
  const currentSquares = history[currentMove];
  const winner = calculateWinner(currentSquares);

  function handlePlay(nextSquares: (string | null)[]) {
    const nextHistory = [...history.slice(0, currentMove + 1), nextSquares];
    setHistory(nextHistory);
    setCurrentMove(nextHistory.length - 1);
  }
  function resetGame() {
  setHistory([Array(9).fill(null)]);
  setCurrentMove(0);
}
  // ----- AI TURN -----
  useEffect(() => {
  if (xIsNext || winner || isDraw(currentSquares)) return;

  const timeout = setTimeout(() => {
    let move = -1;

    if (difficulty === "easy") {
      const moves = getAvailableMoves([...currentSquares]);
      move = moves[Math.floor(Math.random() * moves.length)];
    } 
    else if (difficulty === "medium") {
      if (Math.random() < 0.5) {
        move = findBestMove([...currentSquares]);
      } else {
        const moves = getAvailableMoves([...currentSquares]);
        move = moves[Math.floor(Math.random() * moves.length)];
      }
    } 
    else {
      move = findBestMove([...currentSquares]);
    }

    if (move !== -1) {
      const next = currentSquares.slice();
      next[move] = "O";
      handlePlay(next);
    }
  }, 150);

  return () => clearTimeout(timeout);
    }, [xIsNext, currentSquares, difficulty, winner]);

  return (
    <div className="game">
      <label>
        Difficulty:{" "}
        <select
          value={difficulty}
          onChange={e => setDifficulty(e.target.value as Difficulty)}
        >
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </label>

      <Board
        squares={currentSquares}
        onPlay={handlePlay}
      />
      
      <ResetButton onReset={resetGame} />
    </div>
  );
}

/* ---------- Winner Logic ---------- */
function calculateWinner(
  squares: (string | null)[]
): string | null {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];

  for (const [a, b, c] of lines) {
    if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
      return squares[a];
    }
  }
  return null;
}

function isDraw(squares: (string | null)[]) {
  return squares.every(s => s !== null);
}

function getAvailableMoves(squares: (string | null)[]) {
  return squares
    .map((v, i) => (v === null ? i : null))
    .filter((v): v is number => v !== null);
}

// ----- MINIMAX -----
function minimax(
  squares: (string | null)[],
  depth: number,
  isMaximizing: boolean
): number {
  const winner = calculateWinner(squares);

  if (winner === "O") return 10 - depth;
  if (winner === "X") return depth - 10;
  if (isDraw(squares)) return 0;

  if (isMaximizing) {
    let best = -Infinity;
    for (const i of getAvailableMoves(squares)) {
      squares[i] = "O";
      best = Math.max(best, minimax(squares, depth + 1, false));
      squares[i] = null;
    }
    return best;
  } else {
    let best = Infinity;
    for (const i of getAvailableMoves(squares)) {
      squares[i] = "X";
      best = Math.min(best, minimax(squares, depth + 1, true));
      squares[i] = null;
    }
    return best;
  }
}

function findBestMove(squares: (string | null)[]) {
  let bestScore = -Infinity;
  let move = -1;

  for (const i of getAvailableMoves(squares)) {
    squares[i] = "O";
    const score = minimax(squares, 0, false);
    squares[i] = null;

    if (score > bestScore) {
      bestScore = score;
      move = i;
    }
  }
  return move;
}

