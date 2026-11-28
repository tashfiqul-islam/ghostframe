// A stand-in for statusline/render.ts: only the line the facts read.
const toneOf = (p: number): Tone => (p < 60 ? 'calm' : p < 85 ? 'warm' : 'hot')
