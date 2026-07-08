import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebSocketServer } from 'ws';
import * as z from 'zod';

// Create the server
const server = new McpServer({
    name: 'phaser-monster-tools',
    version: '1.0.0',
});

// --- WebSocket bridge to the Phaser game ---
const wss = new WebSocketServer({ port: 8081 });
let gameSocket = null;          // the currently connected game, if any
const pending = new Map();      // message id -> resolve function
let nextId = 1;

wss.on('connection', (ws) => {
    console.error('[bridge] Phaser game connected');
    gameSocket = ws;

    ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        // Find the promise waiting for this reply, and resolve it
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

// --- Register tools
server.registerTool(
    'create_body',
    {
        description: 'Create the monster body. Must be called before adding any other parts. Replaces any existing monster.',
        inputSchema: z.object({
            color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe('Body color, dark=brown'),
            shape: z.enum(['A', 'B', 'C', 'D', 'E', 'F']).describe('Body shape variant: A=square, B=round, C=oval, D=squat oval, E=long body, F=long body with hair tufts'),
        }),
    },
    async ({ color, shape }) => {
        try {
            const reply = await sendToGame('create_body', { color, shape });
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

// --- TODO: define more tools here
server.registerTool(
    'add_arms',
    {
        description: 'Add a mirrored pair of arms to the monster. Requires create_body to have been called first.',
        inputSchema: z.object({
            color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe('Arm color, dark=brown'),
            pose: z.enum(['A', 'B', 'C', 'D', 'E']).describe('Arm shape variant'),
        }),
    },
    async ({ color, pose }) => {
        try {
            const reply = await sendToGame('add_arms', { color, pose });
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

server.registerTool(
    'add_legs',
    {
        description: 'Add a mirrored pair of legs to the monster. Requires create_body to have been called first.',
        inputSchema: z.object({
            color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe('Leg color, dark=brown'),
            pose: z.enum(['A', 'B', 'C']).describe('Leg shape variant'),
        }),
    },
    async ({ color, pose }) => {
        try {
            const reply = await sendToGame('add_legs', { color, pose });
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

server.registerTool(
    'add_eyes',
    {
        description: 'Add one or more eyes to the monster, evenly spaced. Requires create_body to have been called first.',
        inputSchema: z.object({
            style: z.enum(eyeStyles).describe('Eye style, some include a color (e.g. angry_blue), others do not (e.g. dead, human)'),
            count: z.number().int().min(1).max(6).default(2).describe('Number of eyes, e.g. 1 for a cyclops, 2 for normal, 3+ for something stranger'),
        }),
    },
    async ({ style, count }) => {
        try {
            const reply = await sendToGame('add_eyes', { style, count });
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

server.registerTool(
    'add_mouth',
    {
        description: 'Add a mouth to the monster. Requires create_body to have been called first.',
        inputSchema: z.object({
            style: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']).describe('Mouth style variant'),
        }),
    },
    async ({ style }) => {
        try {
            const reply = await sendToGame('add_mouth', { style });
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

server.registerTool(
    'add_antennas',
    {
        description: 'Add one or more antennas to the monster, evenly spaced. Requires create_body to have been called first.',
        inputSchema: z.object({
            color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe('Antenna color, dark=brown'),
            size: z.enum(['small', 'large']).describe('Antenna size'),
            count: z.number().int().min(1).max(6).default(2).describe('Number of antennas'),
        }),
    },
    async ({ color, size, count }) => {
        try {
            const reply = await sendToGame('add_antennas', { color, size, count });
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

const bodySpec = z.object({
    color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe('Body color, dark=brown'),
    shape: z.enum(['A', 'B', 'C', 'D', 'E', 'F']).describe('Body shape variant'),
});

const armLegSpec = (label, shapes) => z.object({
    color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe(`${label} color, dark=brown`),
    pose: z.enum(shapes).describe(`${label} shape variant`),
});

const eyeSpec = z.object({
    style: z.enum(eyeStyles).describe('Eye style, some include a color (e.g. angry_blue), others do not (e.g. dead, human)'),
    count: z.number().int().min(1).max(6).default(2).describe('Number of eyes, e.g. 1 for a cyclops'),
});

const mouthSpec = z.object({
    style: z.enum(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']).describe('Mouth style variant'),
});

const antennaSpec = z.object({
    color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe('Antenna color, dark=brown'),
    size: z.enum(['small', 'large']).describe('Antenna size'),
    count: z.number().int().min(1).max(6).default(2).describe('Number of antennas'),
});

server.registerTool(
    'build_monster',
    {
        description: 'Build a complete monster in one call from a full specification. Only body is required; any other part can be omitted.',
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