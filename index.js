import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebSocketServer } from 'ws';
import * as z from 'zod';
import fs from 'fs';

const NOTES_PATH = './design_notes.json';

// Create the server
const server = new McpServer({
    name: 'phaser-monster-tools',
    version: '1.0.0',
});

const wss = new WebSocketServer({ port: 8081 });
let gameSocket = null;
const pending = new Map();
let nextId = 1;

wss.on('connection', (ws) => {
    console.error('[bridge] Phaser game connected');
    gameSocket = ws;

    ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        const resolve = pending.get(msg.id);
        if (resolve) {
            resolve(msg);
            pending.delete(msg.id);
        }
    });

    ws.on('close', () => {
        console.error('[bridge] game disconnected');
        if (gameSocket === ws) gameSocket = null;
    });
});

// Send a command to the game and wait for its reply
function sendToGame(command, params = {}) {
    return new Promise((resolve, reject) => {
        if (!gameSocket) {
            reject(new Error('No game connected. Is the game page open in your browser?'));
            return;
        }
        const id = nextId++;
        pending.set(id, resolve);
        gameSocket.send(JSON.stringify({ id, command, params }));

        // Don't wait forever
        setTimeout(() => {
            if (pending.delete(id)) {
                reject(new Error('Game did not respond within 5 seconds.'));
            }
        }, 5000);
    });
}

const eyeStyles = [
    'angry_blue', 'angry_green', 'angry_red',
    'blue', 'red', 'yellow',
    'closed_feminine', 'closed_happy',
    'cute_dark', 'cute_light',
    'dead',
    'human_blue', 'human_green', 'human_red', 'human',
    'psycho_dark', 'psycho_light',
];

const visualModifiers = {
    tint: z.string().optional()
        .describe('Hex color to tint this part, e.g. "#8833ff". Recolors the sprite while keeping its shading/shape.'),
    scale: z.coerce.number().optional()
        .describe('Uniform scale factor, e.g. 1.5 = 50% bigger, 0.6 = smaller. Overridden per-axis by scaleX/scaleY if given.'),
    scaleX: z.coerce.number().optional()
        .describe('Horizontal scale factor. Combine with scaleY for non-uniform stretching, e.g. a thin part.'),
    scaleY: z.coerce.number().optional()
        .describe('Vertical scale factor. Combine with scaleX for non-uniform stretching, e.g. scaleY: 1.6 for a long/tall part.'),
    angle: z.coerce.number().optional()
        .describe('Rotation in degrees applied to this part (positive = clockwise).'),
    dx: z.coerce.number().optional()
        .describe('Horizontal pixel nudge from this part\'s default attachment point. For mirrored parts (arms/legs), positive dx widens the pair (each side moves further out).'),
    dy: z.coerce.number().optional()
        .describe('Vertical pixel nudge from this part\'s default attachment point (positive = down).'),
};

const withModifiers = (shape) => shape.extend(visualModifiers);

// --- Register tools
server.registerTool(
    'create_body',
    {
        description: 'Create the monster body. Must be called before adding any other parts. Replaces any existing monster. ' +
            'Supports optional visual modifiers: tint (hex color), scale/scaleX/scaleY (size), angle (rotation), dx/dy (offset from center).',
        inputSchema: withModifiers(z.object({
            color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe('Body color, dark=brown'),
            shape: z.enum(['A', 'B', 'C', 'D', 'E', 'F']).describe('Body shape variant: A=square, B=round, C=oval, D=squat oval, E=long body, F=long body with hair tufts'),
        })),
    },
    async (params) => {
        try {
            const reply = await sendToGame('create_body', params);
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

server.registerTool(
    'add_arms',
    {
        description: 'Add a mirrored pair of arms to the monster. Requires create_body to have been called first. ' +
            'Supports optional visual modifiers: tint (hex color), scale/scaleX/scaleY (size), angle (rotation), dx (widens/narrows the pair), dy (shifts both up/down).',
        inputSchema: withModifiers(z.object({
            color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe('Arm color, dark=brown'),
            pose: z.enum(['A', 'B', 'C', 'D', 'E']).describe('Arm shape variant'),
        })),
    },
    async (params) => {
        try {
            const reply = await sendToGame('add_arms', params);
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

server.registerTool(
    'add_legs',
    {
        description: 'Add a mirrored pair of legs to the monster. Requires create_body to have been called first. ' +
            'Supports optional visual modifiers: tint (hex color), scale/scaleX/scaleY (size), angle (rotation), dx (widens/narrows the pair), dy (shifts both up/down).',
        inputSchema: withModifiers(z.object({
            color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe('Leg color, dark=brown'),
            pose: z.enum(['A', 'B', 'C']).describe('Leg shape variant'),
        })),
    },
    async (params) => {
        try {
            const reply = await sendToGame('add_legs', params);
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

server.registerTool(
    'add_eyes',
    {
        description: 'Add one or more eyes to the monster, evenly spaced. Requires create_body to have been called first. ' +
            'Supports optional visual modifiers: tint (hex color), scale/scaleX/scaleY (size, e.g. one huge eye), angle (rotation), dx/dy (shifts the whole eye row, e.g. off-center placement).',
        inputSchema: withModifiers(z.object({
            style: z.enum(eyeStyles).describe('Eye style, some include a color (e.g. angry_blue), others do not (e.g. dead, human)'),
            count: z.number().int().min(1).max(6).default(2).describe('Number of eyes, e.g. 1 for a cyclops, 2 for normal, 3+ for something stranger'),
        })),
    },
    async (params) => {
        try {
            const reply = await sendToGame('add_eyes', params);
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

server.registerTool(
    'add_mouth',
    {
        description: 'Add a mouth to the monster. Requires create_body to have been called first. ' +
            'Supports optional visual modifiers: tint (hex color), scale/scaleX/scaleY (size), angle (rotation), dx/dy (positional offset).',
        inputSchema: withModifiers(z.object({
            style: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']).describe('Mouth style variant'),
        })),
    },
    async (params) => {
        try {
            const reply = await sendToGame('add_mouth', params);
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

server.registerTool(
    'add_antennas',
    {
        description: 'Add one or more antennas to the monster, evenly spaced. Requires create_body to have been called first. ' +
            'Supports optional visual modifiers: tint (hex color), scale/scaleX/scaleY (size), angle (rotation), dx/dy (shifts the whole antenna row).',
        inputSchema: withModifiers(z.object({
            color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe('Antenna color, dark=brown'),
            size: z.enum(['small', 'large']).describe('Antenna size'),
            count: z.number().int().min(1).max(6).default(2).describe('Number of antennas'),
        })),
    },
    async (params) => {
        try {
            const reply = await sendToGame('add_antennas', params);
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

const bodySpec = withModifiers(z.object({
    color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe('Body color, dark=brown'),
    shape: z.enum(['A', 'B', 'C', 'D', 'E', 'F']).describe('Body shape variant'),
}));

const armLegSpec = (label, shapes) => withModifiers(z.object({
    color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe(`${label} color, dark=brown`),
    pose: z.enum(shapes).describe(`${label} shape variant`),
}));

const eyeSpec = withModifiers(z.object({
    style: z.enum(eyeStyles).describe('Eye style, some include a color (e.g. angry_blue), others do not (e.g. dead, human)'),
    count: z.number().int().min(1).max(6).default(2).describe('Number of eyes, e.g. 1 for a cyclops'),
}));

const mouthSpec = withModifiers(z.object({
    style: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']).describe('Mouth style variant'),
}));

const antennaSpec = withModifiers(z.object({
    color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe('Antenna color, dark=brown'),
    size: z.enum(['small', 'large']).describe('Antenna size'),
    count: z.number().int().min(1).max(6).default(2).describe('Number of antennas'),
}));

server.registerTool(
    'build_monster',
    {
        description: 'Build a complete monster in one call from a full specification. Only body is required; any other part can be omitted. ' +
            'Each part (body, arms, legs, eyes, mouth, antennas) accepts its own optional visual modifiers: tint, scale/scaleX/scaleY, angle, dx/dy.',
        inputSchema: z.object({
            body: bodySpec,
            arms: armLegSpec('Arm', ['A', 'B', 'C', 'D', 'E']).optional(),
            legs: armLegSpec('Leg', ['A', 'B', 'C']).optional(),
            eyes: eyeSpec.optional(),
            mouth: mouthSpec.optional(),
            antennas: antennaSpec.optional(),
        }),
    },
    async (params) => {
        try {
            const reply = await sendToGame('build_monster', params);
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

let shotCount = 0;

server.registerTool(
    'take_screenshot',
    {
        description: 'Capture an image of the current monster so you can see your work. Use this after building to evaluate the design.',
        inputSchema: z.object({}),
    },
    async () => {
        try {
            const reply = await sendToGame('take_screenshot');
            const b64 = reply.result;

            fs.mkdirSync('gallery', { recursive: true });
            fs.writeFileSync(`gallery/monster_${++shotCount}.png`, Buffer.from(b64, 'base64'));

            return {
                content: [{ type: 'image', data: b64, mimeType: 'image/png' }],
            };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

function loadNotes() {
  try {
    const data = fs.readFileSync(NOTES_PATH, 'utf-8');
    if (!data.trim()) return [];
    return JSON.parse(data);
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

server.registerTool(
    'remember',
    {
        description:
            'Store a design lesson you have learned, so future design sessions can benefit from it. ' +
            'Lessons should be specific and actionable, e.g. "tints below #444444 make parts hard to ' +
            'distinguish against the dark background", not vague, e.g. "use good colors".',
        inputSchema: z.object({
            lesson: z.string().describe('The design lesson to store'),
        }),
    },
    async ({ lesson }) => {
        const notes = loadNotes();
        notes.push({
            timestamp: new Date().toISOString(),
            lesson: lesson,
        });
        fs.writeFileSync(NOTES_PATH, JSON.stringify(notes, null, 2));

        console.error(`[memory] stored lesson #${notes.length}`);
        return {
            content: [{ type: 'text', text: `Lesson stored. You now have ${notes.length} lessons.` }],
        };
    }
);

server.registerTool(
    'recall',
    {
        description: 'Retrieve all design lessons stored so far from previous sessions. ' +
            'Call this at the start of a design task to apply what you have already learned before designing anything.',
        inputSchema: z.object({}),
    },
    async () => {
        const notes = loadNotes();
        if (notes.length === 0) {
            return { content: [{ type: 'text', text: 'No lessons stored yet.' }] };
        }
        const text = notes
            .map((n, i) => `${i + 1}. [${n.timestamp}] ${n.lesson}`)
            .join('\n');
        return { content: [{ type: 'text', text }] };
    }
);

// -- Start the server on stdio
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('MCP server running — waiting for connections.');
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});