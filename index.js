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
            pose: z.string().describe('Arm pose/style variant, e.g. wave, straight, raised'),
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
            pose: z.string().describe('Leg pose/style variant, e.g. standing, walking'),
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
        description: 'Add a mirrored pair of eyes to the monster. Requires create_body to have been called first.',
        inputSchema: z.object({
            color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe('Eye color, dark=brown'),
            pose: z.string().describe('Eye expression/style variant, e.g. happy, angry, wide, sleepy'),
        }),
    },
    async ({ color, pose }) => {
        try {
            const reply = await sendToGame('add_eyes', { color, pose });
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
            color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe('Mouth color, dark=brown'),
            pose: z.string().describe('Mouth expression/style variant, e.g. smile, frown, fangs, roar'),
        }),
    },
    async ({ color, pose }) => {
        try {
            const reply = await sendToGame('add_mouth', { color, pose });
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

server.registerTool(
    'add_antennas',
    {
        description: 'Add a mirrored pair of antennas to the monster. Requires create_body to have been called first.',
        inputSchema: z.object({
            color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe('Antenna color, dark=brown'),
            pose: z.string().describe('Antenna style variant, e.g. straight, bent, curly'),
        }),
    },
    async ({ color, pose }) => {
        try {
            const reply = await sendToGame('add_antennas', { color, pose });
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

server.registerTool(
    'get_monster_state',
    {
        description: 'Get a JSON description of every part currently on the monster.',
        inputSchema: z.object({}),
    },
    async () => {
        try {
            const reply = await sendToGame('get_monster_state', {});
            return { content: [{ type: 'text', text: reply.result }] };
        } catch (err) {
            return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
    }
);

const bodySpec = z.object({
    color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe('Body color, dark=brown'),
    shape: z.enum(['A', 'B', 'C', 'D', 'E', 'F']).describe('Body shape variant: A=square, B=round, C=oval, D=squat oval, E=long body, F=long body with hair tufts'),
});

const partSpec = (label) => z.object({
    color: z.enum(['blue', 'green', 'red', 'yellow', 'dark']).describe(`${label} color, dark=brown`),
    pose: z.string().describe(`${label} pose/style variant`),
});

server.registerTool(
    'build_monster',
    {
        description: 'Build a complete monster in one call from a full specification. Only body is required; any other part can be omitted.',
        inputSchema: z.object({
            body: bodySpec,
            arms: partSpec('Arm').optional(),
            legs: partSpec('Leg').optional(),
            eyes: partSpec('Eye').optional(),
            mouth: partSpec('Mouth').optional(),
            antennas: partSpec('Antenna').optional(),
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